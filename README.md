# @flybondi/graphql-import

[![CircleCI](https://circleci.com/gh/flybondi/graphql-import/tree/develop.svg?style=svg)](https://circleci.com/gh/flybondi/graphql-import/tree/develop)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Import &amp; export definitions in GraphQL SDL (also referred to as GraphQL modules)

> This is a custom fork of [`graphql-import`][graphql-import] created by [prisma.io][prisma].

## Install

```sh
yarn add @flybondi/graphql-import
```

## Usage

```js
const { importSchema } = require('@flybondi/graphql-import');
const { makeExecutableSchema } = require('graphql-tools');

const typeDefs = importSchema('./schema.graphql');
const resolvers = {};

const schema = makeExecutableSchema({ typeDefs, resolvers });
```

Assume the following directory structure:

```sh
.
├── schema.graphql
├── posts.graphql
└── comments.graphql
```

`schema.graphql`

```graphql
# import Post from "posts.graphql"

type Query {
  posts: [Post]
}
```

`posts.graphql`

```graphql
# import Comment from 'comments.graphql'

type Post {
  comments: [Comment]
  id: ID!
  text: String!
  tags: [String]
}
```

`comments.graphql`

```graphql
type Comment {
  id: ID!
  text: String!
}
```

Running `console.log(importSchema('schema.graphql'))` produces the following output:

```graphql
type Query {
  posts: [Post]
}

type Post {
  comments: [Comment]
  id: ID!
  text: String!
  tags: [String]
}

type Comment {
  id: ID!
  text: String!
}
```

## API

Check original [Prisma][prisma] [full documentation][graphql-import-docs] for `graphql-import`.

---

Refactored (and maintained) with 💛 by [Flybondi][flybondi].

[graphql-import]: https://www.npmjs.com/package/graphql-import
[flybondi]: https://flybondi.com
[prisma]: https://www.prisma.io/
[graphql-import-docs]: https://oss.prisma.io/content/graphql-import/overview
