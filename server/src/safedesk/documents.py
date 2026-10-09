import hashlib,re,uuid
from datetime import date,datetime,time,timedelta,timezone as dt_timezone
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from .models import Document,Paragraph,SourceRef,TaskItem,TaskDraft

class DocumentValidationError(ValueError): pass

def split_document(text:str,session_id:str) -> Document:
    if len(text)>20000: raise DocumentValidationError("document_too_long")
    if not text.strip(): raise DocumentValidationError("empty_document")
    paragraphs=[Paragraph(paragraph_id=f"p{i+1}",text=p.strip()) for i,p in enumerate(re.split(r"\n\s*\n",text.strip())) if p.strip()]
    return Document(document_id=hashlib.sha256((session_id+text).encode()).hexdigest()[:24],session_id=session_id,paragraphs=paragraphs)

def verify_source(document:Document,ref:SourceRef):
    return ref.document_id==document.document_id and bool(ref.quote.strip()) and any(p.paragraph_id==ref.paragraph_id and ref.quote in p.text for p in document.paragraphs)

def _parse_time(value:str,reference:date,tz:ZoneInfo):
    for text,days in (("tomorrow",1),("明天",1),("today",0),("今天",0)):
        if text in value.lower(): value=re.sub(text,str(reference+timedelta(days=days)),value,flags=re.I)
    stamp=datetime.fromisoformat(value.strip().replace("Z","+00:00"))
    wall=stamp.replace(tzinfo=None)
    a=wall.replace(tzinfo=tz,fold=0); b=wall.replace(tzinfo=tz,fold=1)
    if a.utcoffset()!=b.utcoffset() or a.astimezone(dt_timezone.utc).astimezone(tz).replace(tzinfo=None)!=wall:
        raise ValueError("ambiguous_timezone")
    if stamp.tzinfo is not None and stamp.utcoffset()!=a.utcoffset():raise ValueError('timezone_mismatch')
    return a

def validate_tasks(document:Document,items:list[TaskItem],reference_date:date,timezone:str):
    try: tz=ZoneInfo(timezone)
    except (ZoneInfoNotFoundError,ValueError): raise DocumentValidationError("invalid_timezone") from None
    valid=[]; clarifications=[]
    for item in items[:30]:
        if not verify_source(document,item.source): clarifications.append(f"{item.title}: source_unlocated"); continue
        task=item.model_copy(deep=True)
        try:
            if not task.start_at or not task.end_at: raise ValueError("missing_start_or_end")
            start=_parse_time(task.start_at,reference_date,tz); end=_parse_time(task.end_at,reference_date,tz)
            if end<=start: raise ValueError("invalid_time_range")
            quote=task.source.quote
            # Timings require explicit source support, independently of model claims.
            tokens=re.findall(r'(?<![\d:])\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?![\d:])',quote)
            supported=[]
            for token in tokens:
                try:supported.append(time.fromisoformat(token))
                except ValueError:continue
            if start.time() not in supported or end.time() not in supported: raise ValueError("time_not_in_source")
            source_dates=re.findall(r"\d{4}-\d{2}-\d{2}",quote)
            relative=any(x in quote.lower() for x in ("today","tomorrow","今天","明天"))
            if not source_dates and not relative: raise ValueError("date_needs_clarification")
            if source_dates and (str(start.date()) not in source_dates or str(end.date()) not in source_dates): raise ValueError("date_not_in_source")
            if relative and not source_dates:
                expected=reference_date+timedelta(days=1 if "tomorrow" in quote.lower() or "明天" in quote else 0)
                if start.date()!=expected or end.date()!=expected: raise ValueError("relative_date_mismatch")
            task.start_at=start.isoformat();task.end_at=end.isoformat()
        except OverflowError:
            task.start_at=task.end_at=None;clarifications.append(f'{item.title}: date_out_of_range')
        except (ValueError,TypeError) as exc:
            task.start_at=task.end_at=None;clarifications.append(f"{task.title}: {exc}")
        valid.append(task)
    return TaskDraft(draft_id=uuid.uuid4().hex,items=valid,clarifications=clarifications)
