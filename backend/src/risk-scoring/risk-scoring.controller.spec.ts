import { Test, TestingModule } from '@nestjs/testing';
import { RiskScoringController } from './risk-scoring.controller';

describe('RiskScoringController', () => {
  let controller: RiskScoringController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RiskScoringController],
    }).compile();

    controller = module.get<RiskScoringController>(RiskScoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
