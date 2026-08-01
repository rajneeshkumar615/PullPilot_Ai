import { createSnapshot } from "./snapshot.js";
import { generateRepositoryReport } from "./reportGenerator.js";

async function main() {
  const repo = process.argv[2];

  if (!repo) {
    console.error("Provide repository path");
    process.exit(1);
  }

  const snapshot = await createSnapshot(repo);

  const report =
    await generateRepositoryReport(snapshot);

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}

main().catch(console.error);