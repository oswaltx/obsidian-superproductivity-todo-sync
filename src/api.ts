import type { SPProject, SPTag, SPTask } from "./types";

/**
 * SuperProductivity's local REST server 403s any request that carries an
 * Origin header ("Requests from web origins are not allowed") — fetch()/XHR
 * always attach one from a renderer context, which blocks it outright.
 * Obsidian's requestUrl() goes through Electron's net stack instead of the
 * renderer's fetch(), so it never attaches one either — that's the whole
 * reason the API exists, to let plugins reach servers like this one.
 */
export class SPApiError extends Error {}

export interface SPConnectionConfig {
	baseUrl: string;
	token: string;
}

export interface RawResponse {
	status: number;
	text: string;
}

/** Low-level request function, swappable so tests can run outside the Obsidian runtime. */
export type RequestFn = (opts: {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}) => Promise<RawResponse>;

export const defaultRequestFn: RequestFn = async (opts) => {
	const { requestUrl } = await import("obsidian");
	const res = await requestUrl({
		url: opts.url,
		method: opts.method,
		headers: opts.headers,
		body: opts.body,
		throw: false,
	});
	return { status: res.status, text: res.text };
};

interface SPEnvelope {
	ok: boolean;
	data?: unknown;
	error?: { message?: string };
}

function isSPEnvelope(value: unknown): value is SPEnvelope {
	return typeof value === "object" && value !== null && "ok" in value;
}

export class SuperProductivityClient {
	constructor(
		private getConfig: () => SPConnectionConfig,
		private requestFn: RequestFn = defaultRequestFn
	) {}

	private request(method: string, path: string, body?: unknown): Promise<RawResponse> {
		const { baseUrl, token } = this.getConfig();
		let base: URL;
		try {
			base = new URL(baseUrl);
		} catch {
			return Promise.reject(new SPApiError(`Invalid base URL: "${baseUrl}".`));
		}
		const data = body !== undefined ? JSON.stringify(body) : undefined;
		const headers: Record<string, string> = {};
		if (token) headers["Authorization"] = `Bearer ${token}`;
		if (data) headers["Content-Type"] = "application/json";
		const fullPath = base.pathname.replace(/\/$/, "") + path;

		return this.requestFn({ url: base.origin + fullPath, method, headers, body: data }).catch((err: unknown) => {
			throw new SPApiError(
				`SuperProductivity is not reachable at ${baseUrl} (is the app running with the local REST API enabled?). ${
					err instanceof Error ? err.message : String(err)
				}`
			);
		});
	}

	/** Calls an endpoint that follows SP's {ok, data} / {ok:false, error} envelope. */
	private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		if (!this.getConfig().token) {
			throw new SPApiError("No API token configured. Open the setup wizard in the plugin settings.");
		}
		const res = await this.request(method, path, body);
		let parsed: unknown;
		try {
			parsed = res.text ? JSON.parse(res.text) : null;
		} catch {
			throw new SPApiError(`Unexpected response from SuperProductivity (status ${res.status}).`);
		}
		if (!isSPEnvelope(parsed) || parsed.ok !== true) {
			const message = isSPEnvelope(parsed) ? parsed.error?.message : undefined;
			throw new SPApiError(message || `Request failed (status ${res.status}).`);
		}
		return parsed.data as T;
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
			return { ok: false, message: e instanceof Error ? e.message : String(e) };
		}
	}
}
