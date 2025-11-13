import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: Date;
  ports: Array<{ private: number; public: number; type: string }>;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export async function listContainers(all: boolean = false): Promise<ContainerInfo[]> {
  try {
    const containers = await docker.listContainers({ all });
    
    return containers.map(container => ({
      id: container.Id,
      name: container.Names[0]?.replace('/', '') || 'unnamed',
      image: container.Image,
      status: container.Status,
      state: container.State,
      created: new Date(container.Created * 1000),
      ports: container.Ports.map(port => ({
        private: port.PrivatePort,
        public: port.PublicPort || 0,
        type: port.Type
      }))
    }));
  } catch (error) {
    console.error('Failed to list containers:', error);
    throw new Error('Failed to list Docker containers');
  }
}

export async function getContainerLogs(
  containerId: string,
  tail: number = 100
): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true
    });
    
    return logs.toString('utf-8');
  } catch (error) {
    console.error(`Failed to get logs for container ${containerId}:`, error);
    throw new Error(`Failed to get container logs: ${error}`);
  }
}

export async function restartContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.restart();
  } catch (error) {
    console.error(`Failed to restart container ${containerId}:`, error);
    throw new Error(`Failed to restart container: ${error}`);
  }
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
  } catch (error) {
    console.error(`Failed to stop container ${containerId}:`, error);
    throw new Error(`Failed to stop container: ${error}`);
  }
}

export async function startContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
  } catch (error) {
    console.error(`Failed to start container ${containerId}:`, error);
    throw new Error(`Failed to start container: ${error}`);
  }
}

export async function getContainerStats(containerId: string): Promise<ContainerStats> {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;
    
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 1;
    const memoryPercent = (memoryUsage / memoryLimit) * 100;
    
    const networkRx = Object.values(stats.networks || {}).reduce((sum: number, net: any) => sum + (net.rx_bytes || 0), 0);
    const networkTx = Object.values(stats.networks || {}).reduce((sum: number, net: any) => sum + (net.tx_bytes || 0), 0);
    
    const blockRead = stats.blkio_stats?.io_service_bytes_recursive?.find((item: any) => item.op === 'Read')?.value || 0;
    const blockWrite = stats.blkio_stats?.io_service_bytes_recursive?.find((item: any) => item.op === 'Write')?.value || 0;
    
    const info = await container.inspect();
    
    return {
      id: containerId,
      name: info.Name.replace('/', ''),
      cpuPercent: parseFloat(cpuPercent.toFixed(2)),
      memoryUsage,
      memoryLimit,
      memoryPercent: parseFloat(memoryPercent.toFixed(2)),
      networkRx,
      networkTx,
      blockRead,
      blockWrite
    };
  } catch (error) {
    console.error(`Failed to get stats for container ${containerId}:`, error);
    throw new Error(`Failed to get container stats: ${error}`);
  }
}

export async function getAllContainerStats(): Promise<ContainerStats[]> {
  try {
    const containers = await listContainers(false);
    const statsPromises = containers.map(c => getContainerStats(c.id));
    return await Promise.all(statsPromises);
  } catch (error) {
    console.error('Failed to get stats for all containers:', error);
    return [];
  }
}

export async function checkDockerAvailability(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch (error) {
    console.error('Docker is not available:', error);
    return false;
  }
}
