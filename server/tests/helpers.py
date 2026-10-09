from hackathon_core.model import ModelTurn

class ScriptedModel:
    def __init__(self,*turns): self.turns=list(turns)
    async def next_action(self,messages,tools,*,budget):
        budget.consume_model_attempt()
        return ModelTurn.model_validate(self.turns.pop(0))
