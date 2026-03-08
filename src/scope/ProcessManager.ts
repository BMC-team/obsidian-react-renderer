/**
 * Plugin-level process manager. Processes persist across note switches.
 * Components subscribe/unsubscribe to process output as they mount/unmount.
 */

export interface ManagedProcess {
	id: string;
	cmd: string;
	cwd: string;
	output: string[];
	running: boolean;
	exitCode: number | null;
	startedAt: number;
	proc: any; // ChildProcess
}

type ProcessListener = () => void;

class ProcessManager {
	private processes = new Map<string, ManagedProcess>();
	private listeners = new Map<string, Set<ProcessListener>>();

	/** Get or create a process entry */
	getProcess(id: string): ManagedProcess | undefined {
		return this.processes.get(id);
	}

	/** List all processes */
	listAll(): ManagedProcess[] {
		return Array.from(this.processes.values());
	}

	/** Run a command, returns process ID */
	run(
		id: string,
		cmd: string,
		options?: { cwd?: string; shell?: string }
	): string {
		// Kill existing process with same ID
		this.kill(id);

		const entry: ManagedProcess = {
			id,
			cmd,
			cwd: options?.cwd || "",
			output: [`$ ${cmd}`, ""],
			running: true,
			exitCode: null,
			startedAt: Date.now(),
			proc: null,
		};

		this.processes.set(id, entry);

		try {
			const { spawn } = require("child_process");
			const isWin = process.platform === "win32";
			const shell = options?.shell || (isWin ? "cmd.exe" : "/bin/bash");
			const shellArgs = isWin ? ["/c", cmd] : ["-c", cmd];

			const proc = spawn(shell, shellArgs, {
				cwd: options?.cwd,
				env: { ...process.env },
				stdio: ["pipe", "pipe", "pipe"],
			});

			entry.proc = proc;

			proc.stdout.on("data", (data: Buffer) => {
				const lines = data.toString().split("\n");
				entry.output.push(...lines);
				this.notify(id);
			});

			proc.stderr.on("data", (data: Buffer) => {
				const lines = data.toString().split("\n");
				entry.output.push(...lines.map((l: string) => `[stderr] ${l}`));
				this.notify(id);
			});

			proc.on("close", (code: number) => {
				entry.running = false;
				entry.exitCode = code;
				entry.proc = null;
				entry.output.push("", `[Process exited with code ${code}]`);
				this.notify(id);
			});

			proc.on("error", (err: Error) => {
				entry.running = false;
				entry.proc = null;
				entry.output.push(`[ERROR] ${err.message}`);
				this.notify(id);
			});
		} catch (err: any) {
			entry.running = false;
			entry.output.push(`[ERROR] ${err.message}`);
			this.notify(id);
		}

		this.notify(id);
		return id;
	}

	/** Write to stdin */
	write(id: string, input: string): void {
		const entry = this.processes.get(id);
		if (entry?.proc?.stdin) {
			entry.proc.stdin.write(input + "\n");
			entry.output.push(`> ${input}`);
			this.notify(id);
		}
	}

	/** Kill a process */
	kill(id: string): void {
		const entry = this.processes.get(id);
		if (entry?.proc) {
			try {
				entry.proc.kill("SIGTERM");
				entry.output.push("[SIGTERM sent]");
				this.notify(id);
			} catch {}
		}
	}

	/** Clear output for a process */
	clearOutput(id: string): void {
		const entry = this.processes.get(id);
		if (entry) {
			entry.output = [];
			entry.exitCode = null;
			this.notify(id);
		}
	}

	/** Remove a finished process entirely */
	remove(id: string): void {
		this.kill(id);
		this.processes.delete(id);
		this.listeners.delete(id);
	}

	/** Subscribe to changes for a process */
	subscribe(id: string, listener: ProcessListener): () => void {
		if (!this.listeners.has(id)) {
			this.listeners.set(id, new Set());
		}
		this.listeners.get(id)!.add(listener);

		return () => {
			this.listeners.get(id)?.delete(listener);
		};
	}

	/** Notify all listeners for a process */
	private notify(id: string): void {
		const subs = this.listeners.get(id);
		if (subs) {
			for (const fn of subs) {
				try { fn(); } catch {}
			}
		}
	}

	/** Kill all processes (plugin unload) */
	killAll(): void {
		for (const [id] of this.processes) {
			this.kill(id);
		}
		this.processes.clear();
		this.listeners.clear();
	}
}

// Singleton instance
export const processManager = new ProcessManager();
