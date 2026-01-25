import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import dgram from 'dgram';

const WakeSchema = z.object({
  mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
});

const AI_NODES: Record<string, { name: string; mac: string; ip: string }> = {
  windows: {
    name: 'Windows AI Node',
    mac: process.env.WINDOWS_VM_MAC || 'AA:BB:CC:DD:EE:FF',
    ip: process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  },
  gpu: {
    name: 'Windows AI Node',
    mac: process.env.WINDOWS_VM_MAC || 'AA:BB:CC:DD:EE:FF',
    ip: process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  },
};

function createMagicPacket(macAddress: string): Buffer {
  const mac = macAddress.replace(/[:-]/g, '');
  const macBuffer = Buffer.from(mac, 'hex');
  
  const packet = Buffer.alloc(102);
  
  for (let i = 0; i < 6; i++) {
    packet[i] = 0xff;
  }
  
  for (let i = 0; i < 16; i++) {
    macBuffer.copy(packet, 6 + i * 6);
  }
  
  return packet;
}

async function sendWakeOnLan(macAddress: string, broadcastIp: string = '255.255.255.255'): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const packet = createMagicPacket(macAddress);
    
    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });
    
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, 9, broadcastIp, (err) => {
        socket.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const node = AI_NODES[id];
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }
  
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = WakeSchema.safeParse(body);
    
    const macAddress = parsed.success && parsed.data.mac ? parsed.data.mac : node.mac;
    
    if (macAddress === 'AA:BB:CC:DD:EE:FF') {
      return NextResponse.json(
        { 
          error: 'MAC address not configured',
          message: 'Set WINDOWS_VM_MAC environment variable or provide mac in request body'
        },
        { status: 400 }
      );
    }
    
    await sendWakeOnLan(macAddress);
    
    return NextResponse.json({
      success: true,
      message: `Wake-on-LAN packet sent to ${node.name}`,
      mac: macAddress,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to send WoL packet', message: error.message },
      { status: 500 }
    );
  }
}
