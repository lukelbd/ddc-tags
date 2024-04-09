import { Denops, fn } from "https://deno.land/x/ddc_vim@v4.0.5/deps.ts#^";
import { readLines } from "https://deno.land/std@0.221.0/io/read_lines.ts";
import { exists } from "https://deno.land/std@0.221.0/fs/mod.ts#^";
import { GatherArguments } from "https://deno.land/x/ddc_vim@v4.0.5/base/source.ts#^";
import { BaseSource, Candidate } from "https://deno.land/x/ddc_vim@v4.0.5/types.ts#^";

type Params = {
  cmd: string[];
  args: string[];
  maxSize: number;
};

export class Source extends BaseSource<Params> {
  private async printError(denops: Denops, message: string): Promise<void> {
    await denops.call("ddc#util#print_error", message, "tags");
  }

  params(): Params {
    return {
      cmd: ["rg", "^{PLACEHOLDER}[_A-Za-z0-9:-]*\t", "--color=never"],
      args: [],
      maxSize: 100,
    };
  }

  async gather(args: GatherArguments<Params>): Promise<Candidate[]> {
    // Parse parameters
    const files = await fn.tagfiles(args.denops);
    const str = args.completeStr.replaceAll(/([\\\[\]^$.*])/g, "\\$1");
    const max = Math.max(1, Math.min(args.sourceParams.maxSize, 2000));
    let cmd = args.sourceParams.cmd;
    cmd = cmd.map((s) => s.replace("{PLACEHOLDER}", str));
    cmd = cmd.concat(["--max-count", max.toString()]);

    // Run commands
    const lines = [];
    const paths = [];
    const current = await fn.expand(args.denops, "%:p")
    for (const file of files) {
      if (lines.length >= max) break;
      const base = await fn.fnamemodify(args.denops, file, ":p:h")
      const path = await fn.fnamemodify(args.denops, file, ":p");
      const isfile = await exists(path);
      if (!current.startsWith(base)) continue;
      if (isfile === null || paths.includes(path)) continue;
      const proc = new Deno.Command(
        cmd[0], {
          args: [...cmd.slice(1), path],
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        });
      const { stdout } = await proc.output();
      lines.push(...new TextDecoder().decode(stdout).split(/\r?\n/));
      paths.push(path);
    }

    // Process result
    const candidates = [];
    const split = (content: string, separator: string): string => {
      if (content.includes(separator)) {
        return content.split(separator).pop() || content;
      } else {
        return content;
      }
    }
    for await (const line of lines) {
      if (candidates.length >= max) break;
      const parts = line.split("\t");
      if (parts.length < 4) continue;
      const candidate = {
        word: split(parts[0], ":"),
        kind: split(parts[3], ":"),
        menu: parts[1],
      };
      candidates.push(candidate);
    }
    return candidates;
  }
}
