[CmdletBinding()]
param(
    [ValidateSet('game', 'editor')][string]$Page = 'game',
    [ValidateSet('auto', 'node', 'python')][string]$Runtime = 'auto',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$normalizedRoot = $projectRoot.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
$sha = [Security.Cryptography.SHA256]::Create()
try { $projectId = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedRoot)) | ForEach-Object { $_.ToString('x2') }) }
finally { $sha.Dispose() }
$ports = 5182..5199
$mutex = $null
$ownsMutex = $false

function Get-LocalHealth([int]$PortNumber) {
    $response = $null
    $reader = $null
    try {
        $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$PortNumber/__night_hotel_health")
        $request.Proxy = $null
        $request.Timeout = 500
        $request.ReadWriteTimeout = 500
        $request.AllowAutoRedirect = $false
        $response = $request.GetResponse()
        if ($response.StatusCode -ne 200 -or $response.ContentLength -gt 4096) { return $null }
        $reader = [IO.StreamReader]::new($response.GetResponseStream(), [Text.Encoding]::UTF8)
        $buffer = New-Object char[] 4097
        $count = $reader.ReadBlock($buffer, 0, $buffer.Length)
        if ($count -le 0 -or $count -gt 4096) { return $null }
        return (-join $buffer[0..($count - 1)]) | ConvertFrom-Json
    }
    catch { return $null }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($response) { $response.Dispose() }
    }
}

function Test-ProjectHealth($Health) {
    return $null -ne $Health -and $Health.app -eq 'night-hotel-local' -and $Health.protocol -eq 1 -and $Health.projectId -eq $projectId -and ($Runtime -eq 'auto' -or $Health.runtime -eq $Runtime)
}

function Test-AvailablePort([int]$PortNumber) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $PortNumber)
    try { $listener.Server.ExclusiveAddressUse = $true; $listener.Start(); return $true }
    catch { return $false }
    finally { $listener.Stop() }
}

function Get-Runtimes {
    $specs = @()
    if ($Runtime -ne 'python') { $specs += @{ Command='node.exe'; Kind='node'; Prefix=@() } }
    if ($Runtime -ne 'node') {
        $specs += @{ Command='py.exe'; Kind='python'; Prefix=@('-3') }
        $specs += @{ Command='python.exe'; Kind='python'; Prefix=@() }
    }
    foreach ($spec in $specs) {
        $command = Get-Command $spec.Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { [pscustomobject]@{ File=$command.Source; Kind=$spec.Kind; Prefix=$spec.Prefix } }
    }
}

function Get-PythonServer {
    # Standard-library fallback; project roots are not exposed by the health endpoint.
    $source = @'
import hashlib
import http.server
import json
import os
import re
import stat
import sys
from urllib.parse import unquote, urlsplit

root = os.path.abspath(sys.argv[1])
real_root = os.path.realpath(root)
port = int(sys.argv[2])
normalized = root.replace("\\", "/").rstrip("/").lower()
identity = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
health = json.dumps({"app": "night-hotel-local", "protocol": 1,
                    "projectId": identity, "runtime": "python", "pid": os.getpid()}).encode("utf-8")

def byte_range(value, size):
    if not value or size == 0:
        return None
    match = re.fullmatch(r"bytes\s*=\s*([0-9]*)-([0-9]*)\s*", value.strip(), re.I)
    if not match or not any(match.groups()):
        return None
    # Bound huge decimal numerals before conversion, including Python's digit limit.
    def number(text):
        text = text.lstrip("0") or "0"
        return size + 1 if len(text) > 32 else int(text)
    first, last = match.groups()
    if not first:
        suffix = number(last)
        return False if suffix == 0 else (max(0, size - suffix), size - 1)
    start, end = number(first), number(last) if last else size - 1
    return False if start >= size or end < start else (start, min(end, size - 1))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript; charset=utf-8",
                      ".css": "text/css; charset=utf-8",
                      ".html": "text/html; charset=utf-8",
                      ".json": "application/json; charset=utf-8",
                      ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
                      ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=root, **kwargs)

    def do_GET(self):
        self.respond(False)

    def do_HEAD(self):
        self.respond(True)

    def respond(self, head):
        sent = False
        try:
            pathname = unquote(urlsplit(self.path).path, errors="strict")
            if pathname == "/__night_hotel_health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(health)))
                self.end_headers()
                sent = True
                if not head:
                    self.wfile.write(health)
                return
            file = os.path.realpath(os.path.join(root, pathname.lstrip("/")))
            if os.path.normcase(os.path.commonpath([real_root, file])) != os.path.normcase(real_root):
                self.send_error(403, "Forbidden")
                return
            if os.path.isdir(file):
                file = os.path.realpath(os.path.join(file, "index.html"))
                if os.path.normcase(os.path.commonpath([real_root, file])) != os.path.normcase(real_root):
                    self.send_error(403, "Forbidden")
                    return
            with open(file, "rb") as source:
                info = os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode):
                    self.send_error(404, "Not found")
                    return
                size = info.st_size
                selected = byte_range(self.headers.get("Range"), size) if not head and not self.headers.get("If-Range") else None
                if selected is False:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                self.send_response(206 if selected else 200)
                self.send_header("Content-Type", self.guess_type(file))
                self.send_header("Accept-Ranges", "bytes")
                length = selected[1] - selected[0] + 1 if selected else size
                self.send_header("Content-Length", str(length))
                if selected:
                    self.send_header("Content-Range", "bytes %d-%d/%d" % (*selected, size))
                self.end_headers()
                sent = True
                if not head:
                    source.seek(selected[0] if selected else 0)
                    while length:
                        chunk = source.read(min(length, 64 * 1024))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        length -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (OSError, ValueError):
            if not sent:
                self.send_error(404, "Not found")
            else:
                self.close_connection = True

    def unsupported(self):
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = unsupported

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def log_message(self, format, *args):
        pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
print("The Night Hotel ready: http://127.0.0.1:%d/" % server.server_port, flush=True)
server.serve_forever()
'@
    $helperDirectory = Join-Path ([IO.Path]::GetTempPath()) 'night-hotel-local'
    [IO.Directory]::CreateDirectory($helperDirectory) | Out-Null
    $helperFile = Join-Path $helperDirectory ("server-v1-$projectId.py")
    if (-not [IO.File]::Exists($helperFile) -or [IO.File]::ReadAllText($helperFile) -ne $source) {
        [IO.File]::WriteAllText($helperFile, $source, [Text.UTF8Encoding]::new($false))
    }
    return $helperFile
}

function Start-LocalServer([int]$PortNumber, $Candidate) {
    if ($Candidate.Kind -eq 'node') {
        $arguments = @(('"' + (Join-Path $projectRoot 'server.mjs') + '"'), "--port=$PortNumber")
    }
    else {
        $arguments = @($Candidate.Prefix) + @(('"' + (Get-PythonServer) + '"'), ('"' + $projectRoot + '"'), [string]$PortNumber)
    }
    $child = $null
    try {
        $child = Start-Process -FilePath $Candidate.File -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
        $clock = [Diagnostics.Stopwatch]::StartNew()
        while ($clock.ElapsedMilliseconds -lt 7000) {
            $health = Get-LocalHealth $PortNumber
            if (Test-ProjectHealth $health) { return $true }
            $child.Refresh()
            if ($child.HasExited -or ($null -ne $health -and $health.projectId -ne $projectId)) { break }
            Start-Sleep -Milliseconds 150
        }
    }
    catch { }
    # Only a child created by this invocation may be stopped. Other servers
    # are never terminated or reused without matching project identity.
    if ($child) {
        try { $child.Refresh(); if (-not $child.HasExited) { $child.Kill() } }
        catch { }
    }
    return $false
}

try {
    $pageFile = if ($Page -eq 'editor') { 'hotel-editor.html' } else { 'index.html' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $pageFile) -PathType Leaf)) { throw 'The requested page is missing. Extract the complete game folder first.' }
    $mutex = [Threading.Mutex]::new($false, "Local\NightHotelLaunch-$projectId")
    try { $ownsMutex = $mutex.WaitOne(15000) }
    catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Another launcher is still preparing this project. Wait a moment and try again.' }

    $selectedPort = $null
    foreach ($candidatePort in $ports) {
        if (Test-ProjectHealth (Get-LocalHealth $candidatePort)) { $selectedPort = $candidatePort; break }
    }
    if ($null -eq $selectedPort) {
        $runtimes = @(Get-Runtimes)
        if ($runtimes.Count -eq 0) { throw 'Node.js or Python 3 is required. Install either runtime, then reopen this launcher.' }
        $available = @($ports | Where-Object { Test-AvailablePort $_ })
        if ($available.Count -eq 0) { throw 'All local ports 5182-5199 are occupied. Close an unused local server, then try again.' }
        $failedRuntimes = [Collections.Generic.HashSet[string]]::new()
        foreach ($candidatePort in $available) {
            if (-not (Test-AvailablePort $candidatePort)) { continue }
            foreach ($candidate in $runtimes) {
                if ($failedRuntimes.Contains($candidate.File)) { continue }
                if (Start-LocalServer $candidatePort $candidate) { $selectedPort = $candidatePort; break }
                if (-not (Test-AvailablePort $candidatePort)) { break }
                [void]$failedRuntimes.Add($candidate.File)
            }
            if ($null -ne $selectedPort) { break }
        }
        if ($null -eq $selectedPort) { throw 'The local server could not start. Check that Node.js or Python 3 runs correctly and that a local port is available.' }
    }
    $suffix = if ($Page -eq 'editor') { '/hotel-editor.html' } else { '/' }
    $address = "http://127.0.0.1:$selectedPort$suffix"
    Write-Host "The Night Hotel is ready: $address"
    if (-not $NoBrowser) { Start-Process -FilePath $address }
}
catch {
    Write-Host ("Launch failed: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    if ($ownsMutex -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
