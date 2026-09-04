/** Extracts a message from a caught value without unsafely assuming it's an Error. */
export function getErrorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	return String(e);
}
