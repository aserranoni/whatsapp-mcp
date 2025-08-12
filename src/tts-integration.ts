import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TTSOptions {
  text: string;
  voiceName?: string;
  outputDirectory?: string;
  speed?: number;
  stability?: number;
  similarity_boost?: number;
}

export class TTSIntegration {
  private audioDir: string;

  constructor(audioDir = './audio') {
    this.audioDir = audioDir;
  }

  async ensureAudioDirectory(): Promise<void> {
    try {
      await fs.access(this.audioDir);
    } catch {
      await fs.mkdir(this.audioDir, { recursive: true });
    }
  }

  async generateTTSWithElevenLabs(options: TTSOptions): Promise<string> {
    await this.ensureAudioDirectory();
    
    // For now, skip ElevenLabs integration since the MCP command structure is different
    // This should be implemented with proper MCP client calls, not CLI commands
    console.log('ElevenLabs integration not configured, falling back to system TTS');
    throw new Error('ElevenLabs MCP integration needs proper implementation with MCP client calls');
  }

  private buildElevenLabsCommand(options: TTSOptions, outputPath: string): string {
    // Build command to use ElevenLabs MCP via Claude Code
    const baseCommand = 'claude mcp elevenlabs text_to_speech';
    const params = [
      `--text "${options.text.replace(/"/g, '\\"')}"`,
      `--output_directory "${path.dirname(outputPath)}"`,
    ];
    
    if (options.voiceName) {
      params.push(`--voice_name "${options.voiceName}"`);
    }
    
    if (options.speed !== undefined) {
      params.push(`--speed ${options.speed}`);
    }
    
    if (options.stability !== undefined) {
      params.push(`--stability ${options.stability}`);
    }
    
    if (options.similarity_boost !== undefined) {
      params.push(`--similarity_boost ${options.similarity_boost}`);
    }
    
    return `${baseCommand} ${params.join(' ')}`;
  }

  async generateSimpleTTS(text: string): Promise<string> {
    // Fallback TTS using system capabilities (macOS say command as example)
    await this.ensureAudioDirectory();
    
    const fileName = `simple_tts_${Date.now()}.aiff`;
    const outputPath = path.resolve(this.audioDir, fileName);
    
    try {
      // Try macOS built-in TTS
      const command = `say "${text.replace(/"/g, '\\"')}" -o "${outputPath}"`;
      await execAsync(command, { timeout: 15000 });
      
      // Convert to MP3 if ffmpeg is available
      try {
        const mp3Path = outputPath.replace('.aiff', '.mp3');
        await execAsync(`ffmpeg -i "${outputPath}" -acodec mp3 "${mp3Path}"`, { timeout: 10000 });
        
        // Clean up original AIFF file
        await fs.unlink(outputPath);
        return mp3Path;
      } catch {
        // Return AIFF if MP3 conversion fails
        return outputPath;
      }
    } catch (error) {
      console.error('Simple TTS failed:', error);
      throw new Error('Both ElevenLabs and system TTS failed');
    }
  }

  async cleanupOldFiles(maxAge = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.audioDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.audioDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old TTS file: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old TTS files:', error);
    }
  }

  formatTextForTTS(taskName: string, summary?: string): string {
    const baseMessage = `Task ${taskName} has been completed successfully.`;
    
    if (summary && summary.length < 200) {
      return `${baseMessage} ${summary}`;
    }
    
    return baseMessage;
  }
}