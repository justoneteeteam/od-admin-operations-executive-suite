import { Controller, Get, Post, Patch, Delete, Query, Param, Body, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CommunicationService } from './communication.service';
import { WhisperTranscriptionService } from '../twilio-voice/whisper-transcription.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('communication')
export class CommunicationController {
    private readonly logger = new Logger(CommunicationController.name);

    constructor(
        private readonly service: CommunicationService,
        private readonly whisperService: WhisperTranscriptionService,
        private readonly prisma: PrismaService,
    ) {}

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

    @Get('call-records/:id/audio')
    async streamAudio(@Param('id') id: string, @Res() res: Response) {
        // Look up by ID or callSid
        let callLog = await this.prisma.callLog.findUnique({ where: { id } });
        if (!callLog) {
            callLog = await this.prisma.callLog.findFirst({ where: { callSid: id } });
        }
        if (!callLog?.recordingUrl) {
            res.status(404).json({ error: 'No recording found' });
            return;
        }

        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const audioUrl = callLog.recordingUrl.endsWith('.mp3')
                ? callLog.recordingUrl
                : `${callLog.recordingUrl}.mp3`;

            const response = await fetch(audioUrl, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                },
            });

            if (!response.ok) {
                this.logger.error(`Failed to fetch recording: ${response.status}`);
                res.status(502).json({ error: 'Failed to fetch recording from Twilio' });
                return;
            }

            res.set({
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400',
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            res.send(buffer);
        } catch (err) {
            this.logger.error(`Audio proxy error: ${err.message}`);
            res.status(500).json({ error: 'Internal error fetching audio' });
        }
    }

    @Post('call-records/:id/retranscribe')
    async retranscribe(@Param('id') id: string) {
        // Look up by ID or by callSid
        let callLog = await this.prisma.callLog.findUnique({ where: { id } });
        if (!callLog) {
            callLog = await this.prisma.callLog.findFirst({ where: { callSid: id } });
        }
        if (!callLog) {
            return { success: false, error: 'Call record not found' };
        }
        if (!callLog.recordingUrl) {
            return { success: false, error: 'No recording URL available for this call' };
        }

        this.logger.log(`Re-transcribing call record ${callLog.id} (SID: ${callLog.callSid})`);

        // Extract recording SID from URL
        const match = callLog.recordingUrl.match(/Recordings\/([A-Za-z0-9]+)/);
        const recordingSid = match ? match[1] : 'unknown';

        // Process synchronously so we can return the actual result
        const result = await this.whisperService.processRecording(callLog.id, callLog.recordingUrl, recordingSid);

        return { ...result, callLogId: callLog.id };
    }
}
