import { Controller, Get, Param, Query } from '@nestjs/common';
import { MockEngineService } from './mock-engine.service';

@Controller('api') // Все мок-запросы будут на /api/:endpointKey/:resource
export class MockEngineController {
  constructor(private readonly mockEngineService: MockEngineService) {}

  @Get(':endpointKey/:resource')
  async handleMockRequest(
    @Param('endpointKey') endpointKey: string,
    @Param('resource') resource: string,
    @Query() query: any,
  ) {
    return this.mockEngineService.generateMockData(
      endpointKey,
      resource,
      query,
    );
  }
}
