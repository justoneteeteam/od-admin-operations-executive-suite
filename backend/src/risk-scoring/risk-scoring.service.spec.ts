import { Test, TestingModule } from '@nestjs/testing';
import { RiskScoringService } from './risk-scoring.service';

describe('RiskScoringService', () => {
  let service: RiskScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskScoringService],
    }).compile();

    service = module.get<RiskScoringService>(RiskScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
