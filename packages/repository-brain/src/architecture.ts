import fs from "node:fs/promises";

import type { RepositorySnapshot } from "./types.js";


export interface ArchitectureReport {
  framework: string[];
  language: string[];
  packageManager: string[];
  database: string[];
  deployment: string[];
  structure: string[];
}


export async function analyzeArchitecture(
  snapshot: RepositorySnapshot
): Promise<ArchitectureReport> {

  const report: ArchitectureReport = {
    framework: [],
    language: [],
    packageManager: [],
    database: [],
    deployment: [],
    structure: [],
  };


  const files = snapshot.files.map(
    file => file.path.toLowerCase()
  );


  const packageJsonFiles =
    snapshot.files.filter(
      file => file.path.endsWith("package.json")
    );


  const packageContent:string[] = [];


  for(const file of packageJsonFiles){

    try{

      const content =
        await fs.readFile(
          file.absolutePath,
          "utf8"
        );

      packageContent.push(content);

    }catch{}

  }


  const allPackages =
    packageContent.join("\n").toLowerCase();



  // -----------------
  // Framework
  // -----------------

  if(allPackages.includes("next")){
    report.framework.push("Next.js");
  }


  if(allPackages.includes("express")){
    report.framework.push("Express.js");
  }


  if(allPackages.includes("react")){
    report.framework.push("React");
  }


  if(allPackages.includes("fastify")){
    report.framework.push("Fastify");
  }



  // -----------------
  // Languages
  // -----------------

  if(files.some(f=>f.endsWith(".ts"))){
    report.language.push("TypeScript");
  }


  if(files.some(f=>f.endsWith(".js"))){
    report.language.push("JavaScript");
  }



  // -----------------
  // Package manager
  // -----------------

  if(files.includes("pnpm-lock.yaml")){
    report.packageManager.push("pnpm");
  }


  if(files.includes("package-lock.json")){
    report.packageManager.push("npm");
  }


  if(files.includes("yarn.lock")){
    report.packageManager.push("yarn");
  }



  // -----------------
  // Database
  // -----------------

  if(allPackages.includes("prisma")){
    report.database.push("Prisma ORM");
  }


  if(
    allPackages.includes("postgres") ||
    allPackages.includes("pg")
  ){
    report.database.push("PostgreSQL");
  }


  if(allPackages.includes("mongoose")){
    report.database.push("MongoDB");
  }



  // -----------------
  // Deployment
  // -----------------

  if(files.some(f=>f.includes("dockerfile"))){
    report.deployment.push("Docker");
  }


  if(files.some(f=>f.includes("vercel"))){
    report.deployment.push("Vercel");
  }


  if(files.some(f=>f.includes("terraform"))){
    report.deployment.push("Terraform");
  }



  // -----------------
  // Architecture
  // -----------------

  if(
    files.some(f=>f.startsWith("apps/web"))
  ){
    report.structure.push(
      "Frontend Application"
    );
  }


  if(
    files.some(f=>f.startsWith("apps/api"))
  ){
    report.structure.push(
      "Backend API Application"
    );
  }


  if(
    files.some(f=>f.startsWith("packages"))
  ){
    report.structure.push(
      "Monorepo Architecture"
    );
  }



  return report;

}