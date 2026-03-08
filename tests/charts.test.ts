import { describe, it, expect } from "vitest";
import React from "react";
import { transpileJSX } from "../src/transpiler/transpile";
import { evaluateComponent } from "../src/scope/evaluate";

const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
	useRef: React.useRef,
	LineChart: (props: any) => React.createElement("canvas"),
	BarChart: (props: any) => React.createElement("canvas"),
	PieChart: (props: any) => React.createElement("canvas"),
	GaugeChart: (props: any) => React.createElement("canvas"),
	Card: (props: any) => React.createElement("div", null, props.children),
};

describe("Chart components", () => {
	it("LineChart with data array", () => {
		const source = `
			const data = [10, 25, 15, 40, 30, 55, 45, 60];
			return <LineChart data={data} color="#4caf50" fillColor="rgba(76,175,80,0.1)" showDots={true} />;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("BarChart with labeled data", () => {
		const source = `
			const data = [
				{ label: "Mon", value: 12, color: "#4a9eff" },
				{ label: "Tue", value: 19, color: "#4caf50" },
				{ label: "Wed", value: 8, color: "#ff9800" },
			];
			return <BarChart data={data} height={150} />;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("PieChart with donut mode", () => {
		const source = `
			const data = [
				{ label: "Active", value: 60, color: "#4caf50" },
				{ label: "Idle", value: 25, color: "#9e9e9e" },
				{ label: "Error", value: 15, color: "#f44336" },
			];
			return <PieChart data={data} donut={true} />;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("GaugeChart with thresholds", () => {
		const source = `
			return <GaugeChart value={72} label="Batch Progress" thresholds={{green: 80, yellow: 40}} />;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("Multiple charts composed in Card", () => {
		const source = `
			return (
				<div>
					<Card title="Temperature Trend">
						<LineChart data={[36.8, 37.0, 37.1, 37.2, 37.0, 37.3]} label="°C" />
					</Card>
					<Card title="Equipment Status">
						<PieChart data={[
							{label: "OK", value: 7, color: "#4caf50"},
							{label: "Warn", value: 2, color: "#ff9800"},
							{label: "Err", value: 1, color: "#f44336"}
						]} donut={true} width={150} height={150} />
					</Card>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
