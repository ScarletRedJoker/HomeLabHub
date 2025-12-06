# Windows VM Partition Resize Guide

## Overview
The Windows 11 VM (RDPWindows) has approximately 300GB of unallocated space that can be added to the C: drive.

## Current Status
- **VM Name**: RDPWindows
- **Current C: drive**: ~100GB (estimated)
- **Unallocated space**: ~300GB
- **Total disk**: ~400GB

## Method 1: Windows Disk Management (Recommended)

### From Windows VM
1. Start the VM:
   ```bash
   ./deploy/local/scripts/start-sunshine-vm.sh start
   ```

2. Connect via RDP or Moonlight

3. Open Disk Management:
   - Press `Win + X` and select **Disk Management**
   - Or run `diskmgmt.msc`

4. Locate the unallocated space (shows as black bar)

5. Right-click on the C: drive and select **Extend Volume**

6. Follow the wizard:
   - Click **Next**
   - Select all available space
   - Click **Next** then **Finish**

7. Verify the new size in File Explorer (This PC)

## Method 2: DiskPart (Command Line)

### From Windows VM (PowerShell as Admin)
```powershell
# Open DiskPart
diskpart

# List all disks
list disk

# Select the main disk (usually disk 0)
select disk 0

# List volumes
list volume

# Select the C: volume (check the volume number)
select volume X   # Replace X with C: volume number

# Extend to use all available space
extend
```

## Method 3: From Linux Host (GParted)

### When VM is OFF
1. Stop the VM:
   ```bash
   ./deploy/local/scripts/start-sunshine-vm.sh stop
   ```

2. Identify the virtual disk:
   ```bash
   sudo virsh domblklist RDPWindows
   ```

3. Mount with `nbd` module:
   ```bash
   sudo modprobe nbd max_part=8
   sudo qemu-nbd --connect=/dev/nbd0 /path/to/windows-disk.qcow2
   ```

4. Use GParted to resize:
   ```bash
   sudo apt install gparted
   sudo gparted /dev/nbd0
   ```

5. In GParted:
   - Select the Windows partition (usually /dev/nbd0p3)
   - Right-click > Resize/Move
   - Drag to extend into unallocated space
   - Click Apply

6. Disconnect:
   ```bash
   sudo qemu-nbd --disconnect /dev/nbd0
   ```

7. Start the VM and let Windows check the filesystem

## Verification

After resizing, verify in Windows:
```powershell
# Check disk space
Get-Volume C

# Or
Get-WmiObject -Class Win32_LogicalDisk | Select-Object DeviceID, Size, FreeSpace
```

## Troubleshooting

### "Extend Volume" is grayed out
- The unallocated space must be immediately to the right of the partition
- Check if there's a recovery partition in between
- Use GParted method to move/delete recovery partition first

### Filesystem errors after resize
```powershell
# Run as Administrator
chkdsk C: /f /r
```

### NTFS partition won't resize from Linux
- Windows Fast Startup must be disabled
- Disable in Windows: Control Panel > Power Options > Choose what power buttons do > Change settings > Uncheck "Turn on fast startup"
