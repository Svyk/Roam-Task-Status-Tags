import { verifyGeneratedArtifacts } from "../build.mjs";

await verifyGeneratedArtifacts();
process.stdout.write("Generated artifacts are current.\n");


