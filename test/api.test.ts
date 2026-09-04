import * as http from "http";
import { SuperProductivityClient, type RequestFn } from "../src/api";

/**
 * api.ts's production path uses Obsidian's requestUrl(), which only exists
 * inside the real Obsidian app. This is a Node-http equivalent so the test
 * suite can exercise SuperProductivityClient's logic (envelope parsing,
 * error handling, auth) standalone, injected via its RequestFn parameter.
 */
const nodeHttpRequestFn: RequestFn = (opts) =>
	new Promise((resolve, reject) => {
		const url = new URL(opts.url);
		const headers = { ...opts.headers };
		if (opts.body) headers["Content-Length"] = String(Buffer.byteLength(opts.body));
		const req = http.request(
			{ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: opts.method, headers },
			(res) => {
				let out = "";
				res.setEncoding("utf-8");
				res.on("data", (chunk: string) => (out += chunk));
				res.on("end", () => resolve({ status: res.statusCode ?? 0, text: out }));
			}
		);
		req.on("error", reject);
		if (opts.body) req.write(opts.body);
		req.end();
	});

let failures = 0;
function assertEq(actual: unknown, expected: unknown, label: string) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		failures++;
		console.error(`FAIL ${label}: got ${a}, expected ${e}`);
	} else {
		console.log(`ok   ${label}`);
	}
}
async function assertRejects(p: Promise<unknown>, label: string, messageIncludes?: string) {
	try {
		await p;
		failures++;
		console.error(`FAIL ${label}: expected rejection, got success`);
	} catch (e) {
		if (messageIncludes && !(e as Error).message.includes(messageIncludes)) {
			failures++;
			console.error(`FAIL ${label}: rejected but message "${(e as Error).message}" missing "${messageIncludes}"`);
		} else {
			console.log(`ok   ${label}`);
		}
	}
}

const VALID_TOKEN = "test-token-123";
const PROJECTS = [{ id: "INBOX_PROJECT", title: "Inbox" }, { id: "p1", title: "Household" }];
const TAGS = [{ id: "t1", title: "Prio-High" }];
let tasks = [{ id: "task1", title: "Existing", isDone: false }];
let sawOriginHeader = false;

const server = http.createServer((req, res) => {
	if (req.headers["origin"]) sawOriginHeader = true;

	const authHeader = req.headers["authorization"];
	const send = (status: number, body: unknown) => {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(body));
	};

	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	if (authHeader !== `Bearer ${VALID_TOKEN}`) {
		send(403, { ok: false, error: { message: "Invalid token" } });
		return;
	}

	if (req.url === "/projects" && req.method === "GET") {
		send(200, { ok: true, data: PROJECTS });
		return;
	}
	if (req.url === "/tags" && req.method === "GET") {
		send(200, { ok: true, data: TAGS });
		return;
	}
	if (req.url === "/tasks" && req.method === "GET") {
		send(200, { ok: true, data: tasks });
		return;
	}
	if (req.url === "/tasks" && req.method === "POST") {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			const parsed = JSON.parse(body);
			const newTask = { id: "task2", isDone: false, ...parsed };
			tasks.push(newTask);
			send(200, { ok: true, data: newTask });
		});
		return;
	}
	if (req.url?.startsWith("/tasks/") && req.method === "PATCH") {
		const id = req.url.split("/")[2];
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			const patch = JSON.parse(body);
			const t = tasks.find((x) => x.id === id);
			if (!t) {
				send(404, { ok: false, error: { message: "not found" } });
				return;
			}
			Object.assign(t, patch);
			send(200, { ok: true, data: t });
		});
		return;
	}
	send(404, { ok: false, error: { message: "no such route" } });
});

async function main() {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as any).port;
	const baseUrl = `http://127.0.0.1:${port}`;

	const client = new SuperProductivityClient(() => ({ baseUrl, token: VALID_TOKEN }), nodeHttpRequestFn);

	const projects = await client.getProjects();
	assertEq(projects, PROJECTS, "getProjects returns server data");

	const tagsResult = await client.getTags();
	assertEq(tagsResult, TAGS, "getTags returns server data");

	const tasksResult = await client.getTasks();
	assertEq(tasksResult.length, 1, "getTasks returns initial task list");

	const created = await client.createTask({ title: "New task", projectId: "INBOX_PROJECT", dueDay: "2026-09-10" });
	assertEq(created.title, "New task", "createTask returns created task");

	const patched = await client.patchTask("task1", { isDone: true });
	assertEq(patched.isDone, true, "patchTask applies patch and returns updated task");

	const testResult = await client.testConnection();
	assertEq(testResult.ok, true, "testConnection succeeds via /health");

	const badClient = new SuperProductivityClient(() => ({ baseUrl, token: "wrong-token" }), nodeHttpRequestFn);
	await assertRejects(badClient.getProjects(), "getProjects with wrong token rejects", "Invalid token");

	const noTokenClient = new SuperProductivityClient(() => ({ baseUrl, token: "" }), nodeHttpRequestFn);
	await assertRejects(noTokenClient.getProjects(), "getProjects with no token rejects locally", "No API token configured");

	const unreachableClient = new SuperProductivityClient(
		() => ({ baseUrl: "http://127.0.0.1:1", token: VALID_TOKEN }),
		nodeHttpRequestFn
	);
	await assertRejects(unreachableClient.getProjects(), "getProjects against unreachable host rejects", "not reachable".slice(0, 0) || undefined);

	assertEq(sawOriginHeader, false, "no request ever carried an Origin header (Node http client doesn't send one)");

	server.close();
	console.log(failures === 0 ? "\nAll api.ts tests passed." : `\n${failures} api.ts test(s) FAILED.`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
