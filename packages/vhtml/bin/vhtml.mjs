#!/usr/bin/env node
import { main } from '@sdkwork/vhtml-cli';

process.exitCode = await main(process.argv.slice(2));
