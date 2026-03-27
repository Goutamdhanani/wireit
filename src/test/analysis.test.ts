/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {test} from 'node:test';
import * as assert from 'node:assert';
import {rigTestNode as rigTest} from './util/rig-test.js';
import {Analyzer} from '../analyzer.js';

void test(
  'analyzes services',
  rigTest(async ({rig}) => {
    //    a
    //  / | \
    // |  v  v
    // |  c  d
    // |    / |
    // b <-+  |
    //        v
    //        e
    await rig.write({
      'package.json': {
        scripts: {
          a: 'wireit',
          b: 'wireit',
          c: 'wireit',
          d: 'wireit',
          e: 'wireit',
        },
        wireit: {
          a: {
            dependencies: ['b', 'c', 'd'],
          },
          b: {
            command: 'true',
            service: true,
          },
          c: {
            command: 'true',
            service: true,
          },
          d: {
            command: 'true',
            dependencies: ['b', 'e'],
          },
          e: {
            command: 'true',
            service: true,
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'a'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Not ok');
    }

    // a
    const a = result.config.value;
    assert.equal(a.name, 'a');
    if (a.command) {
      throw new Error('Expected no-command');
    }
    assert.equal(a.dependencies.length, 3);

    // b
    const b = a.dependencies[0]!.config;
    assert.equal(b.name, 'b');
    if (!b.service) {
      throw new Error('Expected service');
    }
    assert.equal(b.serviceConsumers.length, 1);
    assert.equal(b.serviceConsumers[0]!.name, 'd');
    assert.equal(b.isPersistent, true);

    // c
    const c = a.dependencies[1]!.config;
    assert.equal(c.name, 'c');
    if (!c.service) {
      throw new Error('Expected service');
    }
    assert.equal(c.isPersistent, true);
    assert.equal(c.serviceConsumers.length, 0);
    assert.equal(c.services.length, 0);

    // d
    const d = a.dependencies[2]!.config;
    assert.equal(d.name, 'd');
    assert.equal(d.services.length, 2);
    assert.equal(d.services[0]!.name, 'b');
    assert.equal(d.services[1]!.name, 'e');

    // e
    const e = d.services[1]!;
    assert.equal(e.name, 'e');
    if (!e.service) {
      throw new Error('Expected service');
    }
    assert.equal(e.isPersistent, false);
    assert.equal(e.serviceConsumers.length, 1);
  }),
);

void test(
  '.wireit/, .git/, and node_modules/ are automatically ' +
    'excluded from input and output files by default',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['**/*.ts'],
            output: ['**/*.js'],
            // Don't also automatically add package-lock.json paths as input
            // files, to make this test simpler/more focused.
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {
        packageDir: rig.temp,
        name: 'build',
      },
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Not ok');
    }

    const withDefaultExcludes = result.config.value;
    assert.deepEqual(withDefaultExcludes.files?.values, [
      '**/*.ts',
      '!.git/',
      '!.hg/',
      '!.svn/',
      '!.wireit/',
      '!.yarn/',
      '!CVS/',
      '!node_modules/',
    ]);
    assert.deepEqual(withDefaultExcludes.output?.values, [
      '**/*.js',
      '!.git/',
      '!.hg/',
      '!.svn/',
      '!.wireit/',
      '!.yarn/',
      '!CVS/',
      '!node_modules/',
    ]);
  }),
);

void test(
  'Default excluded paths are not present when ' +
    'allowUsuallyExcludedPaths is true',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['**/*.ts'],
            output: ['**/*.js'],
            // Don't also automatically add package-lock.json paths as input
            // files, to make this test simpler/more focused.
            packageLocks: [],
            allowUsuallyExcludedPaths: true,
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {
        packageDir: rig.temp,
        name: 'build',
      },
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Not ok');
    }

    const build = result.config.value;
    assert.deepEqual(build.files?.values, ['**/*.ts']);
    assert.deepEqual(build.output?.values, ['**/*.js']);
  }),
);

void test(
  'Default excluded paths are not present when files and output are empty',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: [],
            output: [],
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {
        packageDir: rig.temp,
        name: 'build',
      },
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Not ok');
    }

    const build = result.config.value;
    assert.deepEqual(build.files?.values, []);
    assert.deepEqual(build.output?.values, []);
  }),
);

void test(
  'warns when a literal files entry does not match any file',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['missing-file.js'],
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    assert.equal(result.config.ok, false);
    if (result.config.ok) {
      throw new Error('Expected failures but got ok');
    }
    const failures = result.config.error;
    assert.equal(failures.length, 1);
    const failure = failures[0]!;
    assert.equal(failure.reason, 'unresolved-literal-files-entry');
    assert.equal(failure.type, 'failure');
    if (failure.reason !== 'unresolved-literal-files-entry') {
      throw new Error('unexpected reason');
    }
    assert.equal(failure.diagnostic.severity, 'warning');
    assert.ok(failure.diagnostic.message.includes('missing-file.js'));
  }),
);

void test(
  'no warning when a literal files entry matches an existing file',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['real-file.js'],
            packageLocks: [],
          },
        },
      },
    });
    await rig.touch('real-file.js');

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Expected no failures but got: ' + JSON.stringify(result.config.error));
    }
  }),
);

void test(
  'no warning when a glob pattern in files matches no files',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['src/**/*.ts'],
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Expected no failures but got: ' + JSON.stringify(result.config.error));
    }
  }),
);

void test(
  'no warning when a brace expansion pattern in files matches no files',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['src/{a,b}.ts'],
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Expected no failures but got: ' + JSON.stringify(result.config.error));
    }
  }),
);

void test(
  'no warning when a character class pattern in files matches no files',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['src/[abc].ts'],
            packageLocks: [],
          },
        },
      },
    });

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Expected no failures but got: ' + JSON.stringify(result.config.error));
    }
  }),
);

void test(
  'no warning when a literal files entry resolves to a directory',
  rigTest(async ({rig}) => {
    await rig.write({
      'package.json': {
        scripts: {
          build: 'wireit',
        },
        wireit: {
          build: {
            command: 'true',
            files: ['src'],
            packageLocks: [],
          },
        },
      },
    });
    await rig.mkdir('src');

    const analyzer = new Analyzer('npm');
    const result = await analyzer.analyze(
      {packageDir: rig.temp, name: 'build'},
      [],
    );
    if (!result.config.ok) {
      console.log(result.config.error);
      throw new Error('Expected no failures but got: ' + JSON.stringify(result.config.error));
    }
  }),
);
