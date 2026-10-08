import { createEngineContext } from "@audiorective/react";
import { createLandingEngine } from "./setup";

export const engine = createLandingEngine();
export const { EngineProvider, useEngine } = createEngineContext(engine);
