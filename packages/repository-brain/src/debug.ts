import { createSnapshot } from "./snapshot.js";
import { buildStatistics } from "./statistics.js";
import { buildDependencyGraph } from "./dependencyGraph.js";
import { buildSymbolIndex } from "./symbolIndex.js";
import { resolveDependencies } from "./resolver.js";
import { detectCycles } from "./cycleDetector.js";
import { analyzeComplexity } from "./complexity.js";
import { analyzeArchitecture } from "./architecture.js";

async function main() {
  const repo = process.argv[2];

  if (!repo) {
    console.error("Usage:");
    console.error("pnpm dev <repository-path>");
    process.exit(1);
  }

  // Create repository snapshot
  const snapshot = await createSnapshot(repo);

  // Build repository statistics
  const stats = await buildStatistics(snapshot);

  // Build dependency graph
  const graph = await buildDependencyGraph(snapshot);

  // Resolve dependency graph
  const resolved = resolveDependencies(snapshot, graph);

  // Detect circular dependencies
  const cycles = detectCycles(resolved);

  // Analyze code complexity
  const complexity = await analyzeComplexity(snapshot);

  // Analyze architecture
  const architecture =
    await analyzeArchitecture(snapshot);

  // Build symbol index
  const symbols = await buildSymbolIndex(snapshot);

  console.log("\n==============================");
  console.log("Repository Statistics");
  console.log("==============================\n");

  console.log(stats);

  console.log("\n==============================");
  console.log("Dependency Graph");
  console.log("==============================\n");

  console.table(graph.slice(0, 10));

  console.log("\n==============================");
  console.log("Resolved Dependencies");
  console.log("==============================\n");

  console.table(resolved.slice(0, 20));

  console.log("\n==============================");
  console.log("Circular Dependencies");
  console.log("==============================\n");

  console.table(cycles);

  console.log("\n==============================");
  console.log("Code Complexity");
  console.log("==============================\n");

  console.table(
    complexity
      .sort(
        (a, b) => b.complexityScore - a.complexityScore
      )
      .slice(0, 20)
  );

  console.log("\n==============================");
  console.log("Architecture Report");
  console.log("==============================\n");

  console.log(architecture);

  console.log("\n==============================");
  console.log("Exported Symbols");
  console.log("==============================\n");

  console.table(symbols.slice(0, 20));
}

main().catch((error) => {
  console.error("Repository analysis failed:");
  console.error(error);
  process.exit(1);
});