import { chmod, lstat, mkdir, mkdtemp, open, rmdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const protectWindowsDirectory = async directory => {
  // Paths are data passed through the environment, never PowerShell source.
  const script = `
    $ErrorActionPreference = 'Stop'
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    [System.IO.Directory]::SetAccessControl($env:VIRA_PRIVATE_DIRECTORY, $acl)
  `;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await promisify(execFile)(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: { ...process.env, VIRA_PRIVATE_DIRECTORY: directory }, windowsHide: true, timeout: 10000
  });
};

export const openPrivateCredentialsFile = async () => {
  const root = path.join(os.homedir(), '.vira-private');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PRIVATE_CREDENTIALS_DIRECTORY_REQUIRED');
  if (process.platform === 'win32') await protectWindowsDirectory(root);
  else await chmod(root, 0o700);

  const directory = await mkdtemp(path.join(root, 'najafabad-'));
  const file = path.join(directory, 'driver-credentials.json');
  try {
    return { file, handle: await open(file, 'wx', 0o600) };
  } catch (error) {
    await rmdir(directory);
    throw error;
  }
};
