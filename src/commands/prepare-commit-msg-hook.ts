import fs from 'fs/promises';
import chalk from 'chalk';
import { intro, outro, spinner } from '@clack/prompts';
import { getChangedFiles, getDiff, getStagedFiles, gitAdd } from '../utils/git';
import { getConfig } from './config';
import { generateCommitMessageWithChatCompletion } from '../generateCommitMessageFromGitDiff';

const [messageFilePath, commitSource] = process.argv.slice(2);

export const prepareCommitMessageHook = async () => {
  try {
    if (!messageFilePath) {
      throw new Error(
        'Commit message file path is missing. This file should be called from the "prepare-commit-msg" git hook'
      );
    }

    if (commitSource) return;

    const stagedFiles = await getStagedFiles();
    const changedFiles = await getChangedFiles();

    if (!stagedFiles && !changedFiles) {
      outro('No changes detected, write some code and run `oc` again');
      process.exit(1);
    }

    if (!stagedFiles && changedFiles) await gitAdd({ files: changedFiles });

    const staged = await getStagedFiles();

    if (!staged) return;

    intro('opencommit');

    const config = getConfig();

    if (!config?.OPENAI_API_KEY) {
      throw new Error(
        'No OPEN_AI_API exists. Set your OPEN_AI_API=<key> in ~/.opencommit'
      );
    }

    const spin = spinner();
    spin.start('Generating commit message');
    const commitMessage = await generateCommitMessageWithChatCompletion(
      await getDiff({ files: staged })
    );
    if (typeof commitMessage !== 'string') {
      spin.stop('Error');
      throw new Error(commitMessage.error);
    } else spin.stop('Done');

    const fileContent = await fs.readFile(messageFilePath);

    await fs.writeFile(
      messageFilePath,
      commitMessage + '\n' + fileContent.toString()
    );
  } catch (error) {
    outro(`${chalk.red('✖')} ${error}`);
    process.exit(1);
  }
};
