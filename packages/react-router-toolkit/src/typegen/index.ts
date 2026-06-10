export {
  classifyModuleOutletContext,
  computeTypegenTargets,
  NEAREST_OUTLET_CONTEXT_TYPE,
  resolveParentOutletContext,
  TYPEGEN_DIR_NAME,
  TYPEGEN_ROOT_DIR,
  toolkitTypesSpecifier,
} from "./compute";
export type { ModuleOutletContext, ParentOutletContextResolution, TypegenTarget } from "./compute";
export { createProjectFiles } from "./fs";
export { writeTypegenFiles } from "./write";
export type { WriteTypegenFilesResult } from "./write";
