/**
 * Describes the information from a single import line
 *
 */
export interface RawModule {
    imports: string[];
    from: string;
}
/**
 * Configuration options that may be passed to `importSchema`
 */
interface ImportSchemaOptions {
    schemas?: {
        [key: string]: string;
    };
    mergeableTypes?: [string];
}
/**
 * Parse a single import line and extract imported types and schema filename
 *
 * @param importLine Import line
 * @returns Processed import line
 */
export declare function parseImportLine(importLine: string): RawModule;
/**
 * Parse a schema and analyze all import lines
 *
 * @param sdl Schema to parse
 * @returns Array with collection of imports per import line (file)
 */
export declare function parseSDL(sdl: string): RawModule[];
/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @see https://oss.prisma.io/content/graphql-import/overview#description
 * @param schema File path to the initial schema file
 * @param options Import configuration options
 * @param options.schemas An object of schemas as strings
 * @param options.mergeableTypes An array of custom GraphQL types that will
 *  be treated as [root fields]{@link https://oss.prisma.io/content/graphql-import/overview#import-root-fields}
 * @returns Single bundled schema with all imported types
 */
export declare function importSchema(schema: string, options?: ImportSchemaOptions): string;
export {};
