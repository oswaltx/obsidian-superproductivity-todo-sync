import * as http from "http";
import * as https from "https";
import type { SPProject, SPTag, SPTask } from "./types";

/**
 * SuperProductivity's local REST server 403s any request that carries an
 * Origin header ("Requests from web origins are not allowed") — fetch()/XHR
 * always attach one from a renderer context, which blocks it outright. Node's
 * http/https modules never add one, and a desktop Obsidian plugin has full
 * Node access, so we talk to SP through them directly instead of fetch().
 */
export class SPApiError extends Error {}

export interface SPConnectionConfig {
	baseUrl: string;
	token: string;
}

interface RawResponse {
	status: number;
	body: string;
}

export class SuperProductivityClient {
	constructor(private getConfig: () => SPConnectionConfig) {}

	private request(method: string, path: string, body?: unknown): Promise<RawResponse> {
		const { baseUrl, token } = this.getConfig();
		let base: URL;
		try {
			base = new URL(baseUrl);
		} catch {
			return Promise.reject(new SPApiError(`Invalid base URL: "${baseUrl}".`));
		}
		const transport = base.protocol === "https:" ? https : http;
		const data = body !== undefined ? JSON.stringify(body) : null;
		const headers: Record<string, string> = {};
		if (token) headers["Authorization"] = `Bearer ${token}`;
		if (data) {
			headers["Content-Type"] = "application/json";
			headers["Content-Length"] = String(Buffer.byteLength(data));
		}
		const fullPath = base.pathname.replace(/\/$/, "") + path;

		return new Promise((resolve, reject) => {
			const req = transport.request(
				{
					hostname: base.hostname,
					port: base.port ? Number(base.port) : base.protocol === "https:" ? 443 : 80,
					path: fullPath,
					method,
					headers,
				},
				(res) => {
					let out = "";
					res.setEncoding("utf-8");
					res.on("data", (chunk) => (out += chunk));
					res.on("end", () => resolve({ status: res.statusCode ?? 0, body: out }));
				}
			);
			req.on("error", (err) =>
				reject(
					new SPApiError(
						`SuperProductivity is not reachable at ${baseUrl} (is the app running with the local REST API enabled?). ${err.message}`
					)
				)
			);
			if (data) req.write(data);
			req.end();
		});
	}

	/** Calls an endpoint that follows SP's {ok, data} / {ok:false, error} envelope. */
	private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		if (!this.getConfig().token) {
			throw new SPApiError("No API token configured. Open the setup wizard in the plugin settings.");
		}
		const res = await this.request(method, path, body);
		let json: any;
		try {
			json = res.body ? JSON.parse(res.body) : null;
		} catch {
			throw new SPApiError(`Unexpected response from SuperProductivity (status ${res.status}).`);
		}
		if (!json || json.ok !== true) {
			throw new SPApiError(json?.error?.message || `Request failed (status ${res.status}).`);
		}
		return json.data as T;
	}

	getProjects(): Promise<SPProject[]> {
		return this.call("GET", "/projects");
	}

	getTags(): Promise<SPTag[]> {
		return this.call("GET", "/tags");
	}

	getTasks(): Promise<SPTask[]> {
		return this.call("GET", "/tasks");
	}

	patchTask(id: string, patch: Partial<SPTask>): Promise<SPTask> {
		return this.call("PATCH", `/tasks/${id}`, patch);
	}

	createTask(body: Partial<SPTask> & { title: string; projectId: string }): Promise<SPTask> {
		return this.call("POST", "/tasks", body);
	}

	/**
	 * Connectivity + auth check for the setup wizard. Tries /health first
	 * (cheap, confirmed-working endpoint); falls back to /projects since some
	 * SP versions may not expose /health identically.
	 */
	async testConnection(): Promise<{ ok: boolean; message: string }> {
		if (!this.getConfig().token) {
			return { ok: false, message: "Please enter an API token first." };
		}
		try {
			const res = await this.request("GET", "/health");
			if (res.status >= 200 && res.status < 300) {
				return { ok: true, message: "Connection successful." };
			}
			if (res.status === 401 || res.status === 403) {
				return { ok: false, message: "Reached the server, but the token was rejected (status " + res.status + ")." };
			}
		} catch {
			// fall through to /projects
		}
		try {
			const projects = await this.getProjects();
			return { ok: true, message: `Connection successful (${projects.length} project(s) found).` };
		} catch (e) {
			return { ok: false, message: (e as Error).message };
		}
	}
}
