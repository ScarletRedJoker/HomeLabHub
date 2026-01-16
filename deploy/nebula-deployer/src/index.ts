#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { 
  detectEnvironment, 
  getEnvironmentInfo, 
  getEnvironmentEndpoints,
  checkEnvironmentHealth,
  Environment,
  EnvironmentEndpoint 
} from './lib/environment-detector';
import { 
  logger, 
  formatEnvironment, 
  formatStatus,
  formatServiceStatus,
  LogLevel 
} from './lib/logger';
import { 
  runAllProbes, 
  getProbesByCategory, 
  getProbeByName,
  allProbes,
  type Probe,
  type ProbeResult,
  type ProbeSummary
} from './probes';
import { 
  suggestManualSteps 
} from './remediation';
import { 
  createDeployer, 
  runDeployment,
  type SSHConfig,
  type DeployOptions
} from './deployers';
import { 
  syncSecretsToRemote, 
  syncSecretsFromRemote,
  syncAllEnvironments, 
  getDefaultEnvironmentConfigs,
  type SyncOptions
} from './lib/secrets-sync';
import { runSetupWizard } from './wizards/env-setup-wizard';

const program = new Command();

program
  .name('nebula')
  .description('Nebula Command - Deployment Orchestration CLI')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose output')
  .hook('preAction', (thisCommand: Command) => {
    if (thisCommand.opts().verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }
  });

program
  .command('deploy <environment>')
  .description('Deploy to a specific environment (linode, ubuntu-home, windows-vm)')
  .option('-f, --force', 'Force deployment without confirmation')
  .option('-s, --service <service>', 'Deploy specific service only')
  .option('--dry-run', 'Show what would be deployed without executing')
  .option('--skip-verify', 'Skip post-deployment verification')
  .option('--rollback-on-fail', 'Automatically rollback on failure')
  .action(async (environment: string, options) => {
    const validEnvs = ['linode', 'ubuntu-home', 'windows-vm'];
    
    if (!validEnvs.includes(environment)) {
      logger.error(`Invalid environment: ${environment}`);
      logger.info(`Valid environments: ${validEnvs.join(', ')}`);
      process.exit(1);
    }

    logger.header(`Deploying to ${formatEnvironment(environment)}`);
    
    const currentEnv = await getEnvironmentInfo();
    logger.info(`Current environment: ${formatEnvironment(currentEnv.environment)}`);
    
    if (options.dryRun) {
      logger.warn('DRY RUN - No changes will be made');
    }

    if (!options.force && !options.dryRun) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to deploy to ${environment}?`,
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info('Deployment cancelled');
        return;
      }
    }

    const { sshHost, sshUser, sshKeyPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'sshHost',
        message: 'SSH host:',
        default: process.env[`${environment.toUpperCase().replace('-', '_')}_SSH_HOST`] || 
                 (environment === 'linode' ? 'linode.evindrake.net' : 
                  environment === 'ubuntu-home' ? 'host.evindrake.net' : 
                  process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102'),
      },
      {
        type: 'input',
        name: 'sshUser',
        message: 'SSH username:',
        default: process.env[`${environment.toUpperCase().replace('-', '_')}_SSH_USER`] || 
                 (environment === 'linode' ? 'root' : 'evin'),
      },
      {
        type: 'input',
        name: 'sshKeyPath',
        message: 'SSH key path:',
        default: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
      },
    ]);

    const sshConfig: SSHConfig = {
      host: sshHost,
      username: sshUser,
      privateKeyPath: sshKeyPath.replace('~', process.env.HOME || ''),
    };

    try {
      const deployer = createDeployer(environment, sshConfig);

      const deployOptions: DeployOptions = {
        dryRun: options.dryRun,
        force: options.force,
        services: options.service ? [options.service] : undefined,
        skipVerify: options.skipVerify,
        rollbackOnFail: options.rollbackOnFail,
        verbose: program.opts().verbose,
      };

      const result = await runDeployment(deployer, deployOptions);

      logger.blank();
      if (result.success) {
        logger.success(`Deployment to ${environment} completed successfully!`);
      } else {
        logger.error(`Deployment to ${environment} failed`);
        result.errors.forEach(err => logger.error(`  - ${err}`));
        
        if (result.rollbackAvailable && deployer.rollback) {
          const { shouldRollback } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'shouldRollback',
              message: 'Would you like to rollback to the previous version?',
              default: true,
            },
          ]);

          if (shouldRollback) {
            const spinner = ora('Rolling back...').start();
            const rollbackSuccess = await deployer.rollback();
            if (rollbackSuccess) {
              spinner.succeed('Rollback completed');
            } else {
              spinner.fail('Rollback failed');
            }
          }
        }
        process.exit(1);
      }
      
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Interactive setup wizard for Nebula Command')
  .option('-e, --environment <env>', 'Specify environment (linode, ubuntu-home, windows-vm, replit)')
  .option('-s, --schema <path>', 'Path to schema file')
  .option('-o, --output <path>', 'Output path for .env file')
  .option('--non-interactive', 'Run in non-interactive mode')
  .option('--skip-existing', 'Skip variables that already have values')
  .option('--force', 'Overwrite all existing values')
  .action(async (options) => {
    try {
      await runSetupWizard({
        environment: options.environment,
        schemaPath: options.schema,
        outputPath: options.output,
        interactive: !options.nonInteractive,
        skipExisting: options.skipExisting,
        force: options.force,
      });
    } catch (error) {
      if ((error as Error).message?.includes('cancelled')) {
        logger.info('Setup cancelled');
      } else {
        logger.error(`Setup failed: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  });

program
  .command('verify')
  .description('Verify all endpoints and services are accessible')
  .option('-e, --environment <env>', 'Verify specific environment only')
  .option('-c, --category <category>', 'Probe category: service, infrastructure, or ai')
  .option('--remediate', 'Attempt to fix failed probes')
  .option('--parallel', 'Run probes in parallel (default: true)')
  .action(async (options) => {
    logger.header('Verifying Endpoints & Services');

    let probesToRun: Probe[] = allProbes;

    if (options.category) {
      const validCategories = ['service', 'infrastructure', 'ai'];
      if (!validCategories.includes(options.category)) {
        logger.error(`Invalid category: ${options.category}`);
        logger.info(`Valid categories: ${validCategories.join(', ')}`);
        process.exit(1);
      }
      probesToRun = getProbesByCategory(options.category as 'service' | 'infrastructure' | 'ai');
      logger.info(`Running ${options.category} probes (${probesToRun.length} probes)`);
    } else {
      logger.info(`Running all probes (${probesToRun.length} probes)`);
    }

    logger.blank();

    const summary = await runAllProbes(probesToRun, {
      parallel: options.parallel !== false,
    });

    logger.blank();
    logger.subheader('Probe Results');

    const failedProbes: Array<{ probe: string; result: ProbeResult }> = [];

    for (const { probe, result } of summary.results) {
      const statusIcon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${statusIcon} ${probe}: ${result.message}`);
      
      if (!result.success) {
        failedProbes.push({ probe, result });
      }
    }

    logger.blank();
    logger.subheader('Summary');
    logger.table({
      'Total': String(summary.total),
      'Passed': chalk.green(String(summary.passed)),
      'Failed': summary.failed > 0 ? chalk.red(String(summary.failed)) : String(summary.failed),
      'Skipped': String(summary.skipped),
      'Duration': `${summary.duration}ms`,
    });

    if (failedProbes.length > 0 && options.remediate) {
      logger.blank();
      logger.subheader('Attempting Remediation');

      for (const { probe: probeName, result } of failedProbes) {
        const probeObj = getProbeByName(probeName);
        
        if (result.canRemediate && probeObj?.remediate) {
          const spinner = ora(`Remediating ${probeName}...`).start();
          try {
            const success = await probeObj.remediate();
            if (success) {
              spinner.succeed(`${probeName}: Remediation successful`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              const recheckResult = await probeObj.check();
              if (recheckResult.success) {
                console.log(chalk.green(`    ✓ Service now healthy`));
              } else {
                console.log(chalk.yellow(`    ⚠ Service still unhealthy after remediation`));
              }
            } else {
              spinner.fail(`${probeName}: Remediation failed`);
              const manualSteps = suggestManualSteps(result.message);
              console.log(chalk.gray(`    ${manualSteps.title}`));
            }
          } catch (error) {
            spinner.fail(`${probeName}: Remediation error - ${(error as Error).message}`);
          }
        } else {
          const manualSteps = suggestManualSteps(result.message);
          console.log(chalk.yellow(`  ⚠ ${probeName} requires manual intervention:`));
          console.log(chalk.gray(`    ${manualSteps.title}`));
          manualSteps.steps.forEach((step, i) => {
            console.log(chalk.gray(`      ${i + 1}. ${step}`));
          });
        }
      }
    } else if (failedProbes.length > 0) {
      logger.blank();
      logger.info('Run with --remediate to attempt automatic fixes');
    }

    if (summary.failed > 0) {
      process.exit(1);
    }
  });

program
  .command('secrets')
  .description('Manage secrets across environments')
  .addCommand(
    new Command('sync')
      .description('Synchronize secrets to remote environments')
      .option('-e, --environment <env>', 'Sync to specific environment only')
      .option('--dry-run', 'Show what would be synced without executing')
      .option('--backup', 'Create backup before syncing')
      .option('--source <path>', 'Source .env file path', '.env')
      .action(async (options) => {
        logger.header('Secrets Synchronization');

        if (options.dryRun) {
          logger.warn('DRY RUN - No changes will be made');
        }

        const syncOptions: SyncOptions = {
          dryRun: options.dryRun,
          backup: options.backup ?? true,
        };

        const envConfigs = getDefaultEnvironmentConfigs();
        const enabledConfigs = envConfigs.filter(c => c.enabled);

        if (options.environment) {
          const targetConfig = envConfigs.find(c => c.environment === options.environment);
          if (!targetConfig) {
            logger.error(`Environment not found: ${options.environment}`);
            logger.info(`Available environments: ${envConfigs.map(c => c.environment).join(', ')}`);
            process.exit(1);
          }

          const spinner = ora(`Syncing to ${targetConfig.name}...`).start();
          try {
            const result = await syncSecretsToRemote(
              options.source,
              targetConfig.host,
              targetConfig.envPath,
              targetConfig.sshConfig,
              syncOptions
            );

            if (result.success) {
              spinner.succeed(`${targetConfig.name}: ${result.secretsTransferred} secrets synced`);
            } else {
              spinner.fail(`${targetConfig.name}: ${result.error}`);
              process.exit(1);
            }
          } catch (error) {
            spinner.fail(`${targetConfig.name}: ${(error as Error).message}`);
            process.exit(1);
          }
        } else {
          const results = await syncAllEnvironments({
            sourceEnvPath: options.source,
            environments: enabledConfigs,
          }, syncOptions);

          logger.blank();
          logger.subheader('Sync Results');

          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;

          for (const result of results) {
            const icon = result.success ? chalk.green('✓') : chalk.red('✗');
            const message = result.success 
              ? `${result.secretsTransferred} secrets` 
              : result.error;
            console.log(`  ${icon} ${result.environment}: ${message}`);
          }

          logger.blank();
          if (failCount > 0) {
            logger.warn(`${successCount}/${results.length} environments synced successfully`);
            process.exit(1);
          } else {
            logger.success(`All ${successCount} environments synced successfully!`);
          }
        }
      })
  )
  .addCommand(
    new Command('pull')
      .description('Pull secrets from a remote environment')
      .argument('<environment>', 'Environment to pull from')
      .option('--dry-run', 'Show what would be synced without executing')
      .option('--output <path>', 'Output .env file path', '.env')
      .option('--backup', 'Create backup before overwriting')
      .action(async (environment: string, options) => {
        logger.header(`Pulling Secrets from ${environment}`);

        if (options.dryRun) {
          logger.warn('DRY RUN - No changes will be made');
        }

        const envConfigs = getDefaultEnvironmentConfigs();
        const targetConfig = envConfigs.find(c => c.environment === environment);
        
        if (!targetConfig) {
          logger.error(`Environment not found: ${environment}`);
          logger.info(`Available environments: ${envConfigs.map(c => c.environment).join(', ')}`);
          process.exit(1);
        }

        const spinner = ora(`Pulling from ${targetConfig.name}...`).start();
        try {
          const result = await syncSecretsFromRemote(
            targetConfig.host,
            targetConfig.envPath,
            options.output,
            targetConfig.sshConfig,
            {
              dryRun: options.dryRun,
              backup: options.backup ?? true,
            }
          );

          if (result.success) {
            spinner.succeed(`Pulled ${result.secretsTransferred} secrets from ${targetConfig.name}`);
            if (result.diff) {
              logger.blank();
              logger.table({
                'Added': String(result.diff.added.length),
                'Changed': String(result.diff.changed.length),
                'Removed': String(result.diff.removed.length),
                'Unchanged': String(result.diff.unchanged.length),
              });
            }
          } else {
            spinner.fail(`Failed: ${result.error}`);
            process.exit(1);
          }
        } catch (error) {
          spinner.fail(`Failed: ${(error as Error).message}`);
          process.exit(1);
        }
      })
  );

program
  .command('status')
  .description('Show status of all environments and services')
  .option('-w, --watch', 'Watch mode - continuously update status')
  .option('-j, --json', 'Output as JSON')
  .option('-c, --category <category>', 'Probe category: service, infrastructure, or ai')
  .action(async (options) => {
    const showStatus = async () => {
      if (!options.json) {
        logger.header('Nebula Command Status');
      }

      const currentEnv = await getEnvironmentInfo();

      let probesToRun: Probe[] = allProbes;
      if (options.category) {
        probesToRun = getProbesByCategory(options.category as 'service' | 'infrastructure' | 'ai');
      }

      const probeSummary = await runAllProbes(probesToRun, { parallel: true });

      if (options.json) {
        const statusData = {
          current: currentEnv,
          probes: probeSummary,
          timestamp: new Date().toISOString(),
        };
        console.log(JSON.stringify(statusData, null, 2));
        return;
      }

      logger.subheader('Current Environment');
      logger.table({
        'Environment': formatEnvironment(currentEnv.environment),
        'Hostname': currentEnv.hostname,
        'Platform': currentEnv.platform,
        'Production': currentEnv.isProduction ? chalk.green('Yes') : chalk.yellow('No'),
        'Tailscale': currentEnv.tailscaleIP || chalk.gray('Not connected'),
      });

      logger.blank();
      logger.subheader('Service Status');

      for (const { probe, result } of probeSummary.results) {
        const statusIcon = result.success ? chalk.green('●') : chalk.red('○');
        const latency = result.details?.latencyMs ? chalk.gray(`(${result.details.latencyMs}ms)`) : '';
        console.log(`  ${statusIcon} ${probe} ${latency}`);
        
        if (!result.success && result.message) {
          console.log(chalk.gray(`      └─ ${result.message}`));
        }
      }

      logger.blank();
      logger.subheader('Summary');
      const healthPercent = Math.round((probeSummary.passed / probeSummary.total) * 100);
      const healthColor = healthPercent >= 80 ? chalk.green : healthPercent >= 50 ? chalk.yellow : chalk.red;
      console.log(`  Health: ${healthColor(`${healthPercent}%`)} (${probeSummary.passed}/${probeSummary.total} services healthy)`);
      console.log(`  Check duration: ${probeSummary.duration}ms`);

      logger.blank();
      logger.subheader('Capabilities');
      logger.list(currentEnv.capabilities);

      logger.blank();
      logger.info(`Detection method: ${chalk.gray(currentEnv.detectionMethod)}`);
    };

    if (options.watch) {
      const refreshInterval = 10000;
      logger.info(`Watch mode enabled - refreshing every ${refreshInterval / 1000}s (Ctrl+C to exit)`);
      
      while (true) {
        console.clear();
        await showStatus();
        await new Promise(resolve => setTimeout(resolve, refreshInterval));
      }
    } else {
      await showStatus();
    }
  });

program
  .command('env')
  .description('Show detected environment information')
  .action(async () => {
    const info = await getEnvironmentInfo();
    
    logger.header('Environment Detection');
    logger.table({
      'Environment': formatEnvironment(info.environment),
      'Hostname': info.hostname,
      'Platform': info.platform,
      'Production': info.isProduction ? 'Yes' : 'No',
      'Tailscale IP': info.tailscaleIP || 'Not connected',
      'Detection Method': info.detectionMethod,
    });

    logger.blank();
    logger.subheader('Capabilities');
    logger.list(info.capabilities);
  });

program.parse();
