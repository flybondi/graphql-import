'use strict';
const fs = require('fs');
const glob = require('glob');
const { parse, print, Kind } = require('graphql');
const {
  flatten,
  groupBy,
  includes,
  equals,
  indexBy,
  compose,
  trim,
  endsWith,
  test
} = require('ramda');
const path = require('path');
const resolveFrom = require('resolve-from');
const { completeDefinitionPool, getNodeName } = require('./definition');

const rootFields = ['Query', 'Mutation', 'Subscription', 'schema'];

const readUTF8File = filePath => fs.readFileSync(filePath, { encoding: 'utf8' });

const isFile = compose(
  endsWith('.graphql'),
  trim
);

const isGlob = test(/\*.*\.graphql/);

const read = (schema, schemas) => {
  if (isGlob(schema)) {
    return glob
      .sync(schema)
      .map(readUTF8File)
      .join('\n');
  }
  if (isFile(schema)) {
    return readUTF8File(schema);
  }
  return schemas ? schemas[schema] : schema;
};

/**
 * Parse a single import line and extract imported types and schema filename
 *
 * @param importLine Import line
 * @returns Processed import line
 */
function parseImportLine(importLine) {
  // Apply regex to import line
  const matches = importLine.match(/^import (\*|(.*)) from ('|")(.*)('|");?$/);
  if (!matches || matches.length !== 6 || !matches[4]) {
    throw new Error(`Too few regex matches: ${matches}`);
  }

  // Extract matches into named variables
  const [, wildcard, importsString, , from] = matches;

  // Extract imported types
  const imports = wildcard === '*' ? ['*'] : importsString.split(',').map(d => d.trim());

  // Return information about the import line
  return { imports, from };
}

/**
 * Parse a schema and analyze all import lines
 *
 * @param sdl Schema to parse
 * @returns Array with collection of imports per import line (file)
 */
function parseSDL(sdl) {
  return sdl
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('# import ') || l.startsWith('#import '))
    .map(l => l.replace('#', '').trim())
    .map(parseImportLine);
}

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
function importSchema(schema, options = {}) {
  const { schemas, mergeableTypes = [] } = options;
  const allMergeableTypes = [...mergeableTypes, ...rootFields];
  const sdl = read(schema, schemas) || schema;
  let document = getDocumentFromSDL(sdl);

  // Recursively process the imports, starting by importing all types from the initial schema
  let { allDefinitions, typeDefinitions } = collectDefinitions(['*'], sdl, schema, schemas);

  // Post processing of the final schema (missing types, unused types, etc.)
  // Query, Mutation, Subscription and any custom type defined in `mergeableTypes`
  // should be merged
  // And should always be in the first set, to make sure they
  // are not filtered out.
  const firstTypes = flatten(typeDefinitions).filter(d =>
    includes(getNodeName(d), allMergeableTypes)
  );
  const otherFirstTypes = typeDefinitions[0].filter(
    d => !includes(getNodeName(d), allMergeableTypes)
  );
  const firstSet = firstTypes.concat(otherFirstTypes);
  const processedTypeNames = [];
  const mergedFirstTypes = [];
  for (const type of firstSet) {
    if (!includes(getNodeName(type), processedTypeNames)) {
      processedTypeNames.push(getNodeName(type));
      mergedFirstTypes.push(type);
    } else {
      const existingType = mergedFirstTypes.find(t => getNodeName(t) === getNodeName(type));

      if (type.kind === 'SchemaDefinition') {
        existingType.operationTypes = existingType.operationTypes.concat(type.operationTypes);
      } else {
        existingType.fields = existingType.fields.concat(type.fields);
      }
    }
  }

  document = {
    ...document,
    definitions: completeDefinitionPool(flatten(allDefinitions), firstSet, flatten(typeDefinitions))
  };
  // Return the schema as string
  return print(document);
}

/**
 * Parses a schema into a graphql DocumentNode.
 * If the schema is empty a DocumentNode with empty definitions will be created.
 *
 * @param sdl Schema to parse
 * @returns A graphql DocumentNode with definitions of the parsed sdl.
 */
function getDocumentFromSDL(sdl) {
  if (isEmptySDL(sdl)) {
    return {
      kind: Kind.DOCUMENT,
      definitions: []
    };
  } else {
    return parse(sdl, { noLocation: true });
  }
}

/**
 * Check if a schema contains any type definitions at all.
 *
 * @param sdl Schema to parse
 * @returns True if SDL only contains comments and/or whitespaces
 */
function isEmptySDL(sdl) {
  return (
    sdl
      .split('\n')
      .map(l => l.trim())
      .filter(l => !(l.length === 0 || l.startsWith('#'))).length === 0
  );
}

/**
 * Resolve the path of an import.
 * First it will try to find a file relative from the file the import is in, if that fails it will try to resolve it as a module so imports from packages work correctly.
 *
 * @param filePath Path the import was made from
 * @param importFrom Path given for the import
 * @returns Full resolved path to a file
 */
function resolveModuleFilePath(filePath, importFrom) {
  const dirname = path.dirname(filePath);
  if (isFile(filePath) && isFile(importFrom)) {
    try {
      return fs.realpathSync(path.join(dirname, importFrom));
    } catch (e) {
      if (e.code === 'ENOENT') {
        return resolveFrom(dirname, importFrom);
      }
    }
  }

  return importFrom;
}

/**
 * Recursively process all schema files. Keeps track of both the filtered
 * type definitions, and all type definitions, because they might be needed
 * in post-processing (to add missing types)
 *
 * @param imports Types specified in the import statement
 * @param sdl Current schema
 * @param filePath File location for current schema
 * @param Tracking of processed schemas (for circular dependencies)
 * @param Tracking of imported type definitions per schema
 * @param Tracking of all type definitions per schema
 * @returns Both the collection of all type definitions, and the collection of imported type definitions
 */
function collectDefinitions(
  imports,
  sdl,
  filePath,
  schemas,
  processedFiles = new Map(),
  typeDefinitions = [],
  allDefinitions = []
) {
  const key = isFile(filePath) ? path.resolve(filePath) : filePath;

  // Get TypeDefinitionNodes from current schema
  const document = getDocumentFromSDL(sdl);

  // Add all definitions to running total
  allDefinitions.push(filterTypeDefinitions(document.definitions));

  // Filter TypeDefinitionNodes by type and defined imports
  const currentTypeDefinitions = filterImportedDefinitions(
    imports,
    document.definitions,
    allDefinitions
  );

  // Add type definitions to running total
  typeDefinitions.push(currentTypeDefinitions);

  // Read imports from current file
  const rawModules = parseSDL(sdl);

  // Process each file (recursively)
  rawModules.forEach(m => {
    // If it was not yet processed (in case of circular dependencies)
    const moduleFilePath = resolveModuleFilePath(filePath, m.from);

    const processedFile = processedFiles.get(key);
    if (!processedFile || !processedFile.find(rModule => equals(rModule, m))) {
      // Mark this specific import line as processed for this file (for circular dependency cases)
      processedFiles.set(key, processedFile ? processedFile.concat(m) : [m]);
      collectDefinitions(
        m.imports,
        read(moduleFilePath, schemas),
        moduleFilePath,
        schemas,
        processedFiles,
        typeDefinitions,
        allDefinitions
      );
    }
  });

  // Return the maps of type definitions from each file
  return { allDefinitions, typeDefinitions };
}

/**
 * Filter the types loaded from a schema, first by relevant types,
 * then by the types specified in the import statement.
 *
 * @param imports Types specified in the import statement
 * @param typeDefinitions All definitions from a schema
 * @returns Filtered collection of type definitions
 */
function filterImportedDefinitions(imports, typeDefinitions, allDefinitions = []) {
  // This should do something smart with fields

  const filteredDefinitions = filterTypeDefinitions(typeDefinitions);

  if (includes('*', imports)) {
    if (imports.length === 1 && imports[0] === '*' && allDefinitions.length > 1) {
      const previousTypeDefinitions = indexBy(
        getNodeName,
        flatten(allDefinitions.slice(0, allDefinitions.length - 1)).filter(
          def => !includes(getNodeName(def), rootFields)
        )
      );
      return typeDefinitions.filter(
        typeDef =>
          typeDef.kind === 'ObjectTypeDefinition' && previousTypeDefinitions[typeDef.name.value]
      );
    }
    return filteredDefinitions;
  } else {
    const result = filteredDefinitions.filter(d =>
      includes(getNodeName(d), imports.map(i => i.split('.')[0]))
    );
    const fieldImports = imports.filter(i => i.split('.').length > 1);
    const groupedFieldImports = groupBy(x => x.split('.')[0], fieldImports);

    for (const rootType in groupedFieldImports) {
      const fields = groupedFieldImports[rootType].map(x => x.split('.')[1]);
      filteredDefinitions.find(
        def => getNodeName(def) === rootType
      ).fields = filteredDefinitions
        .find(def => getNodeName(def) === rootType)
        .fields.filter(f => includes(f.name.value, fields) || includes('*', fields));
    }

    return result;
  }
}

/**
 * Filter relevant definitions from schema
 *
 * @param definitions All definitions from a schema
 * @returns Relevant type definitions
 */
function filterTypeDefinitions(definitions) {
  const validKinds = [
    'SchemaDefinition',
    'DirectiveDefinition',
    'ScalarTypeDefinition',
    'ObjectTypeDefinition',
    'InterfaceTypeDefinition',
    'EnumTypeDefinition',
    'UnionTypeDefinition',
    'InputObjectTypeDefinition'
  ];
  return definitions.filter(d => includes(d.kind, validKinds));
}

module.exports = {
  parseImportLine,
  parseSDL,
  importSchema
};
