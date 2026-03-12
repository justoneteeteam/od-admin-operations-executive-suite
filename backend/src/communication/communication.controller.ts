import { Controller, Get, Post, Patch, Delete, Query, Param, Body } from '@nestjs/common';
import { CommunicationService } from './communication.service';

@Controller('communication')
export class CommunicationController {
    constructor(private readonly service: CommunicationService) {}

    // ─── TEMPLATES ─────────────────────────────────────────────────────

    @Get('templates')
    listTemplates(
        @Query('channel') channel?: string,
        @Query('language') language?: string,
        @Query('search') search?: string,
    ) {
        return this.service.listTemplates({ channel, language, search });
    }

    @Post('templates')
    createTemplate(@Body() body: any) {
        return this.service.createTemplate(body);
    }

    @Patch('templates/:id')
    updateTemplate(@Param('id') id: string, @Body() body: any) {
        return this.service.updateTemplate(id, body);
    }

    @Delete('templates/:id')
    deleteTemplate(@Param('id') id: string) {
        return this.service.deleteTemplate(id);
    }

    // ─── SEQUENCES ─────────────────────────────────────────────────────

    @Get('sequences')
    listSequences() {
        return this.service.listSequences();
    }

    @Post('sequences')
    createSequence(@Body() body: any) {
        return this.service.createSequence(body);
    }

    @Get('sequences/:id')
    getSequence(@Param('id') id: string) {
        return this.service.getSequence(id);
    }

    @Patch('sequences/:id')
    updateSequence(@Param('id') id: string, @Body() body: any) {
        return this.service.updateSequence(id, body);
    }

    @Delete('sequences/:id')
    deleteSequence(@Param('id') id: string) {
        return this.service.deleteSequence(id);
    }

    // ─── SEQUENCE STEPS ────────────────────────────────────────────────

    @Post('sequences/:id/steps')
    addStep(@Param('id') sequenceId: string, @Body() body: any) {
        return this.service.addStep(sequenceId, body);
    }

    @Delete('sequences/:seqId/steps/:stepId')
    removeStep(@Param('stepId') stepId: string) {
        return this.service.removeStep(stepId);
    }

    @Patch('sequences/:id/steps/reorder')
    reorderSteps(@Param('id') sequenceId: string, @Body() body: { stepIds: string[] }) {
        return this.service.reorderSteps(sequenceId, body.stepIds);
    }

    // ─── CALL RECORDS ──────────────────────────────────────────────────

    @Get('call-records')
    listCallRecords(
        @Query('type') type?: string,
        @Query('intent') intent?: string,
        @Query('language') language?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.service.listCallRecords({
            type,
            intent,
            language,
            search,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
    }

    @Patch('call-records/:id/note')
    updateCsNote(@Param('id') id: string, @Body() body: { note: string }) {
        return this.service.updateCsNote(id, body.note);
    }
}
