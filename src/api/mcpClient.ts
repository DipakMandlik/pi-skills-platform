import type { MCPHealthResponse, MCPToolCallResponse, MCPToolDefinition } from '../types';
import { isDemoMode } from '../demo/demoMode';
import { mockMcpRequest } from '../demo/mockMcp';

interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

interface MCPRequestOptions {
  timeoutMs?: number;
}

export class MCPClient {
  constructor(private readonly baseUrl = (import.meta as any).env?.VITE_MCP_BASE_URL) {
    if (!this.baseUrl) {
      throw new Error('VITE_MCP_BASE_URL environment variable is not set');
    }
  }

  private readonly timeoutMs = Number((import.meta as any).env?.VITE_MCP_REQUEST_TIMEOUT_MS || 30000);

  async getHealth(options?: MCPRequestOptions): Promise<MCPHealthResponse> {
    return this.request<MCPHealthResponse>('/health', { method: 'GET' }, options);
  }

  async listTools(options?: MCPRequestOptions): Promise<MCPToolDefinition[]> {
    const response = await this.request<{ tools: MCPToolDefinition[] }>('/mcp/tools', { method: 'GET' }, options);
    return response.tools;
  }

  async callTool<T = unknown>(payload: ToolCallRequest, options?: MCPRequestOptions): Promise<MCPToolCallResponse<T>> {
    return this.request<MCPToolCallResponse<T>>('/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, options);
  }

  private async request<T>(path: string, init: RequestInit, options?: MCPRequestOptions): Promise<T> {
    if (isDemoMode()) {
      return mockMcpRequest<T>(path, init);
    }

    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // Use the MCP-specific opaque token; fall back to auth_token for
    // environments where only a single token is present (e.g. demo mode).
    const token = window.localStorage.getItem('mcp_token') || window.localStorage.getItem('auth_token');

    const requestHeaders = new Headers(init.headers || {});
    if (token && !requestHeaders.has('Authorization')) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: requestHeaders,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`MCP request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const body = await response.json();

    if (!response.ok) {
      const message = body?.detail?.message || body?.detail || body?.message || 'MCP request failed';
      throw new Error(String(message));
    }

    return body as T;
  }
}

export const mcpClient = new MCPClient();
