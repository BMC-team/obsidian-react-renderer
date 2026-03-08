import { describe, it, expect } from "vitest";
import { transpileJSX, clearTranspileCache } from "../src/transpiler/transpile";

describe("transpileJSX", () => {
	it("transpiles simple JSX to createElement calls", async () => {
		const result = await transpileJSX("<div>Hello</div>");
		expect(result.error).toBeNull();
		expect(result.code).toContain("React.createElement");
		expect(result.code).toContain("Hello");
	});

	it("transpiles JSX with expressions", async () => {
		const result = await transpileJSX('<div>{1 + 1}</div>');
		expect(result.error).toBeNull();
		expect(result.code).toContain("1 + 1");
	});

	it("transpiles TSX with type annotations", async () => {
		const result = await transpileJSX(
			'const x: number = 5; const el = <span>{x}</span>;'
		);
		expect(result.error).toBeNull();
		expect(result.code).not.toContain(": number");
		expect(result.code).toContain("React.createElement");
	});

	it("transpiles component with hooks", async () => {
		const result = await transpileJSX(`
			const [count, setCount] = useState(0);
			return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
		`);
		expect(result.error).toBeNull();
		expect(result.code).toContain("useState");
		expect(result.code).toContain("onClick");
	});

	it("returns error for invalid syntax", async () => {
		const result = await transpileJSX("<div><span></div>");
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toBeTruthy();
		expect(result.code).toBeNull();
	});

	it("returns error for completely broken code", async () => {
		const result = await transpileJSX("{{{{");
		expect(result.error).not.toBeNull();
		expect(result.code).toBeNull();
	});

	it("caches results for identical source", async () => {
		clearTranspileCache();
		const source = "<div>cached</div>";
		const result1 = await transpileJSX(source);
		const result2 = await transpileJSX(source);
		expect(result1.code).toBe(result2.code);
	});

	it("handles empty input", async () => {
		const result = await transpileJSX("");
		// Empty string is valid JS (no-op)
		expect(result.error).toBeNull();
	});

	it("handles nested JSX", async () => {
		const result = await transpileJSX(`
			<div>
				<h1>Title</h1>
				<ul>
					<li>Item 1</li>
					<li>Item 2</li>
				</ul>
			</div>
		`);
		expect(result.error).toBeNull();
		expect(result.code).toContain("React.createElement");
	});

	it("handles JSX with style objects", async () => {
		const result = await transpileJSX(
			'<div style={{color: "red", fontSize: "16px"}}>Styled</div>'
		);
		expect(result.error).toBeNull();
		expect(result.code).toContain("color");
		expect(result.code).toContain("fontSize");
	});
});
