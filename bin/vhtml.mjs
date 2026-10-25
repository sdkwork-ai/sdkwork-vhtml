#!/usr/bin/env node
import { main } from '../packages/cli/dist/index.js';

process.exitCode = await main(process.argv.slice(2));
