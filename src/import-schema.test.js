'use strict';
const fs = require('fs');
const { parseImportLine, parseSDL, importSchema } = require('./import-schema');

test('parseImportLine: parse single import', () => {
  expect(parseImportLine(`import A from "schema.graphql"`)).toEqual({
    imports: ['A'],
    from: 'schema.graphql'
  });
});

test('parseImportLine: optional semicolon', () => {
  expect(parseImportLine(`import A from "schema.graphql";`)).toEqual({
    imports: ['A'],
    from: 'schema.graphql'
  });
});

test('parseImportLine: invalid', () => {
  expect(() => parseImportLine(`import from "schema.graphql"`)).toThrowError(Error);
});

test('parseImportLine: invalid 2', () => {
  expect(() => parseImportLine(`import A from ""`)).toThrowError(Error);
});

test('parseImportLine: parse multi import', () => {
  expect(parseImportLine(`import A, B from "schema.graphql"`)).toEqual({
    imports: ['A', 'B'],
    from: 'schema.graphql'
  });
});

test('parseImportLine: parse multi import (weird spacing)', () => {
  expect(parseImportLine(`import  A  ,B   from "schema.graphql"`)).toEqual({
    imports: ['A', 'B'],
    from: 'schema.graphql'
  });
});

test('parseImportLine: different path', () => {
  expect(parseImportLine(`import A from "../new/schema.graphql"`)).toEqual({
    imports: ['A'],
    from: '../new/schema.graphql'
  });
});

test('parseImportLine: module in node_modules', () => {
  expect(parseImportLine(`import A from "module-name"`)).toEqual({
    imports: ['A'],
    from: 'module-name'
  });
});

test('parseSDL: non-import comment', () => {
  expect(parseSDL(`#importent: comment`)).toEqual([]);
});

test('parse: multi line import', () => {
  const sdl = `\
# import A from "a.graphql"
# import * from "b.graphql"
  `;
  expect(parseSDL(sdl)).toEqual([
    {
      imports: ['A'],
      from: 'a.graphql'
    },
    {
      imports: ['*'],
      from: 'b.graphql'
    }
  ]);
});

test('Module in node_modules', () => {
  const b = `\
# import lower from './lower.graphql'
type B {
  id: ID!
  nickname: String! @lower
}
`;
  const lower = `\
directive @lower on FIELD_DEFINITION
`;
  const expectedSDL = `\
type A {
  id: ID!
  author: B!
}

type B {
  id: ID!
  nickname: String! @lower
}

directive @lower on FIELD_DEFINITION
`;
  const moduleDir = 'node_modules/graphql-import-test';
  if (!fs.existsSync(moduleDir)) {
    fs.mkdirSync(moduleDir);
  }
  fs.writeFileSync(moduleDir + '/b.graphql', b);
  fs.writeFileSync(moduleDir + '/lower.graphql', lower);
  expect(importSchema('fixtures/import-module/a.graphql')).toBe(expectedSDL);
});

test('importSchema: imports only', () => {
  const expectedSDL = `\
type Query {
  first: String
  second: Float
  third: String
}
`;
  expect(importSchema('fixtures/imports-only/all.graphql')).toBe(expectedSDL);
});

test('importSchema: import duplicate', () => {
  const expectedSDL = `\
type Query {
  first: String
  second: Float
  third: String
}
`;
  expect(importSchema('fixtures/import-duplicate/all.graphql')).toBe(expectedSDL);
});

test('importSchema: import nested', () => {
  const expectedSDL = `\
type Query {
  first: String
  second: Float
  third: String
}
`;
  expect(importSchema('fixtures/import-nested/all.graphql')).toBe(expectedSDL);
});

test('importSchema: field types', () => {
  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  c: C
  hello: String!
}

type C {
  id: ID!
}
`;
  expect(importSchema('fixtures/field-types/a.graphql')).toBe(expectedSDL);
});

test('importSchema: enums', () => {
  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

enum B {
  B1
  B2
  B3
}
`;
  expect(importSchema('fixtures/enums/a.graphql')).toBe(expectedSDL);
});

test('importSchema: import all', () => {
  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  expect(importSchema('fixtures/import-all/a.graphql')).toBe(expectedSDL);
});

test('importSchema: import all from objects', () => {
  const schemaC = `
    type C1 {
      id: ID!
    }

    type C2 {
      id: ID!
    }

    type C3 {
      id: ID!
    }`;

  const schemaB = `
    # import * from 'schemaC'

    type B {
      hello: String!
      c1: C1
      c2: C2
    }`;

  const schemaA = `
    # import B from 'schemaB'

    type A {
      # test 1
      first: String
      second: Float
      b: B
    }`;

  const schemas = {
    schemaA,
    schemaB,
    schemaC
  };

  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  expect(importSchema(schemaA, { schemas })).toBe(expectedSDL);
});

test(`importSchema: single object schema`, () => {
  const schemaA = `
    type A {
      field: String
    }`;

  const expectedSDL = `\
type A {
  field: String
}
`;

  expect(importSchema(schemaA)).toBe(expectedSDL);
});

test(`importSchema: import all mix 'n match`, () => {
  const schemaB = `
    # import C1, C2 from 'fixtures/import-all/c.graphql'

    type B {
      hello: String!
      c1: C1
      c2: C2
    }`;

  const schemaA = `
    # import * from "schemaB"

    type A {
      # test 1
      first: String
      second: Float
      b: B
    }`;

  const schemas = {
    schemaB
  };

  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  expect(importSchema(schemaA, { schemas })).toBe(expectedSDL);
});

test(`importSchema: import all mix 'n match 2`, () => {
  const schemaA = `
    # import * from "fixtures/import-all/b.graphql"

    type A {
      # test 1
      first: String
      second: Float
      b: B
    }`;

  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  expect(importSchema(schemaA)).toBe(expectedSDL);
});

test(`importSchema: import all - exclude Query/Mutation/Subscription type`, () => {
  const schemaC = `
    type C1 {
      id: ID!
    }

    type C2 {
      id: ID!
    }

    type C3 {
      id: ID!
    }

    type Query {
      hello: String!
    }

    type Mutation {
      hello: String!
    }

    type Subscription {
      hello: String!
    }
    `;

  const schemaB = `
    # import * from 'schemaC'

    type B {
      hello: String!
      c1: C1
      c2: C2
    }`;

  const schemaA = `
    # import B from 'schemaB'

    type Query {
      greet: String!
    }

    type A {
      # test 1
      first: String
      second: Float
      b: B
    }`;

  const schemas = {
    schemaA,
    schemaB,
    schemaC
  };

  const expectedSDL = `\
type Query {
  greet: String!
}

type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  expect(importSchema(schemaA, { schemas })).toBe(expectedSDL);
});

test('importSchema: scalar', () => {
  const expectedSDL = `\
type A {
  b: B
}

scalar B
`;
  expect(importSchema('fixtures/scalar/a.graphql')).toBe(expectedSDL);
});

test('importSchema: directive', () => {
  const expectedSDL = `\
type A {
  first: String @upper
  second: String @withB @deprecated
}

directive @upper on FIELD_DEFINITION

scalar B

directive @withB(argB: B) on FIELD_DEFINITION
`;
  expect(importSchema('fixtures/directive/a.graphql')).toBe(expectedSDL);
});

test('importSchema: interfaces', () => {
  const expectedSDL = `\
type A implements B {
  first: String
  second: Float
}

interface B {
  second: Float
  c: [C!]!
}

type C {
  c: ID!
}
`;
  expect(importSchema('fixtures/interfaces/a.graphql')).toBe(expectedSDL);
});

test('importSchema: interfaces-many', () => {
  const expectedSDL = `\
type A implements B {
  first: String
  second: Float
}

interface B {
  second: Float
  c: [C!]!
}

type C implements D1 & D2 {
  c: ID!
}

interface D1 {
  d1: ID!
}

interface D2 {
  d2: ID!
}
`;
  expect(importSchema('fixtures/interfaces-many/a.graphql')).toBe(expectedSDL);
});

test('importSchema: interfaces-implements', () => {
  const expectedSDL = `\
type A implements B {
  id: ID!
}

interface B {
  id: ID!
}

type B1 implements B {
  id: ID!
}
`;
  expect(importSchema('fixtures/interfaces-implements/a.graphql')).toBe(expectedSDL);
});

test('importSchema: interfaces-implements-many', () => {
  const expectedSDL = `\
type A implements B {
  id: ID!
}

interface B {
  id: ID!
}

type B1 implements B {
  id: ID!
}

type B2 implements B {
  id: ID!
}
`;
  expect(importSchema('fixtures/interfaces-implements-many/a.graphql')).toBe(expectedSDL);
});

test('importSchema: input types', () => {
  const expectedSDL = `\
type A {
  first(b: B): String
  second: Float
}

input B {
  hello: [C!]!
}

input C {
  id: ID!
}
`;
  expect(importSchema('fixtures/input-types/a.graphql')).toBe(expectedSDL);
});

test('importSchema: complex test', () => {
  expect(() => {
    importSchema('fixtures/complex/a.graphql');
  }).not.toThrow();
});

test('circular imports', () => {
  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C1
  c2: C2
  a: A
}

type C1 {
  id: ID!
}

type C2 {
  id: ID!
}
`;
  const actualSDL = importSchema('fixtures/circular/a.graphql');
  expect(actualSDL).toBe(expectedSDL);
});

test('related types', () => {
  const expectedSDL = `\
type A {
  first: String
  second: Float
  b: B
}

type B {
  hello: String!
  c1: C
}

type C {
  field: String
}
`;
  const actualSDL = importSchema('fixtures/related-types/a.graphql');
  expect(actualSDL).toBe(expectedSDL);
});

test('relative paths', () => {
  const expectedSDL = `\
type Query {
  feed: [Post!]!
}

type Mutation {
  createDraft(title: String!, text: String): Post
  publish(id: ID!): Post
}

type Post implements Node {
  id: ID!
  isPublished: Boolean!
  title: String!
  text: String!
}

interface Node {
  id: ID!
}
`;
  const actualSDL = importSchema('fixtures/relative-paths/src/schema.graphql');
  expect(actualSDL).toBe(expectedSDL);
});

test('root field imports', () => {
  const expectedSDL = `\
type Query {
  posts(filter: PostFilter): [Post]
}

type Dummy {
  field: String
}

type Post {
  field1: String
}

input PostFilter {
  field3: Int
}
`;
  const actualSDL = importSchema('fixtures/root-fields/a.graphql');
  expect(actualSDL).toBe(expectedSDL);
});

test('merged root field imports', () => {
  const expectedSDL = `\
type Query {
  helloA: String
  posts(filter: PostFilter): [Post]
  hello: String
}

type Dummy {
  field: String
}

type Post {
  field1: String
}

input PostFilter {
  field3: Int
}
`;
  const actualSDL = importSchema('fixtures/merged-root-fields/a.graphql');
  expect(actualSDL).toBe(expectedSDL);
});

test('merged custom root fields imports', () => {
  const expectedSDL = `\
type Query {
  helloA: String
  posts(filter: PostFilter): [Post]
  hello: String
}

type Dummy {
  field: String
  field2: String
}

type Post {
  field1: String
}

input PostFilter {
  field3: Int
}
`;
  const actualSDL = importSchema('fixtures/merged-root-fields/a.graphql', {
    mergeableTypes: ['Dummy']
  });
  expect(actualSDL).toBe(expectedSDL);
});

test('global schema modules', () => {
  const shared = `
    type Shared {
      first: String
    }
  `;
  const expectedSDL = `\
type A {
  first: String
  second: Shared
}

type Shared {
  first: String
}
`;
  expect(importSchema('fixtures/global/a.graphql', { schemas: { shared } })).toBe(expectedSDL);
});

test('glob import', () => {
  const expectedSDL = `\
type Query {
  movie(id: ID!): Movie
  book(id: ID!): Book
}

type Mutation {
  readBook(id: ID!): Book
}

type Movie {
  id: ID!
  name: String
  director: String
  seen: Boolean!
}

type Book {
  id: ID!
  name: String
  read: Boolean!
}
`;
  expect(importSchema('fixtures/import-glob/*.graphql')).toBe(expectedSDL);
});

test('missing type on type', () => {
  expect(() => importSchema('fixtures/type-not-found/a.graphql')).toThrowError(
    "Field test: Couldn't find type Post in any of the schemas."
  );
});

test('missing type on interface', () => {
  expect(() => importSchema('fixtures/type-not-found/b.graphql')).toThrowError(
    "Field test: Couldn't find type Post in any of the schemas."
  );
});

test('missing type on input type', () => {
  expect(() => importSchema('fixtures/type-not-found/c.graphql')).toThrowError(
    "Field post: Couldn't find type Post in any of the schemas."
  );
});

test('missing interface type', () => {
  expect(() => importSchema('fixtures/type-not-found/d.graphql')).toThrowError(
    "Couldn't find interface MyInterface in any of the schemas."
  );
});

test('missing union type', () => {
  expect(() => importSchema('fixtures/type-not-found/e.graphql')).toThrowError(
    "Couldn't find type C in any of the schemas."
  );
});

test('missing type on input type', () => {
  expect(() => importSchema('fixtures/type-not-found/f.graphql')).toThrowError(
    "Field myfield: Couldn't find type Post in any of the schemas."
  );
});

test('missing type on directive', () => {
  expect(() => importSchema('fixtures/type-not-found/g.graphql')).toThrowError(
    "Directive first: Couldn't find type first in any of the schemas."
  );
});

test('import with collision', () => {
  // Local type gets preference over imported type
  const expectedSDL = `\
type User {
  id: ID!
  name: String!
}
`;
  expect(importSchema('fixtures/collision/a.graphql')).toBe(expectedSDL);
});
