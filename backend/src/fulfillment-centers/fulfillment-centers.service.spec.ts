import { Test, TestingModule } from '@nestjs/testing';
import { FulfillmentCentersService } from './fulfillment-centers.service';

describe('FulfillmentCentersService', () => {
  let service: FulfillmentCentersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FulfillmentCentersService],
    }).compile();

    service = module.get<FulfillmentCentersService>(FulfillmentCentersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
