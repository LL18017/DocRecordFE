# ----------------------------------------------------------------------------
# Captura la ventana de Chrome que Playwright lanzó, CON la barra de direcciones.
#
#   powershell -File capturar-ventana.ps1 -PerfilDir <ruta> -Salida <archivo.png>
#
# Por qué existe: `page.screenshot()` de Playwright fotografía el documento, no
# el navegador. Nunca incluye la barra de direcciones ni el indicador de sitio
# seguro, y esa barra es justo la evidencia que exige el Laboratorio 2 -- es lo
# que distingue el sistema corriendo en la URL pública de una instalación local.
#
# La ventana se identifica por el `--user-data-dir` con el que se lanzó, no por
# el título: si el equipo tiene otra ventana de Chrome abierta en el mismo sitio,
# el título coincidiría y se fotografiaría la ventana equivocada. El perfil es
# único por corrida, así que no hay ambigüedad.
#
# Se usa PrintWindow con PW_RENDERFULLCONTENT (2) y no una captura de pantalla
# completa: fotografía SOLO esa ventana, sin el escritorio ni el resto de las
# aplicaciones abiertas, y funciona aunque la ventana no esté al frente.
# ----------------------------------------------------------------------------
param(
    [Parameter(Mandatory = $true)][string]$PerfilDir,
    [Parameter(Mandatory = $true)][string]$Salida,
    # Trae la ventana al frente antes de disparar. Algunas paginas -Jira entre
    # ellas- se dibujan atenuadas mientras la ventana no tiene el foco, y
    # PrintWindow fotografia ese estado: la captura sale con un velo gris.
    # Roba el foco un instante, asi que solo se pide donde hace falta.
    [switch]$AlFrente
)

$ErrorActionPreference = 'Stop'

if (-not ([System.Management.Automation.PSTypeName]'CapturaDeVentana').Type) {
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class CapturaDeVentana {
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    // Sin esto Windows miente sobre el tamaño de la ventana. PowerShell arranca
    // sin conciencia de PPP, así que en una pantalla al 200% GetWindowRect
    // devuelve la mitad de los píxeles reales: la captura sale a 700x440 en vez
    // de 1400x880 y se pierde medio contenido. Hay que llamarlo ANTES de medir.
    public static void ActivarPPP() { SetProcessDPIAware(); }

    public static bool AlFrente(IntPtr handle) { return SetForegroundWindow(handle); }

    public static string Tomar(IntPtr handle, string ruta) {
        RECT r;
        if (!GetWindowRect(handle, out r)) return "no se pudo medir la ventana";
        int ancho = r.Right - r.Left, alto = r.Bottom - r.Top;
        if (ancho <= 0 || alto <= 0) return "la ventana mide 0";

        using (Bitmap bmp = new Bitmap(ancho, alto))
        using (Graphics g = Graphics.FromImage(bmp)) {
            IntPtr hdc = g.GetHdc();
            bool ok = PrintWindow(handle, hdc, 2);   // 2 = PW_RENDERFULLCONTENT
            g.ReleaseHdc(hdc);
            if (!ok) return "PrintWindow falló";
            bmp.Save(ruta, System.Drawing.Imaging.ImageFormat.Png);
        }
        return "ok:" + ancho + "x" + alto;
    }
}
"@
}

[CapturaDeVentana]::ActivarPPP()

# Chrome levanta un proceso por pestaña y por servicio; todos comparten el mismo
# --user-data-dir en su línea de comandos. Solo el proceso del navegador tiene
# ventana principal, así que filtrar por MainWindowHandle deja exactamente uno.
$perfil = $PerfilDir.Replace('/', '\')
$pids = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.Replace('/', '\').Contains($perfil) } |
        Select-Object -ExpandProperty ProcessId

$ventana = $null
foreach ($procId in $pids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc -and $proc.MainWindowHandle -ne 0) { $ventana = $proc; break }
}

if (-not $ventana) {
    Write-Output "ERROR: no se encontró la ventana del perfil $PerfilDir"
    exit 1
}

$carpeta = Split-Path -Parent $Salida
if ($carpeta -and -not (Test-Path $carpeta)) { New-Item -ItemType Directory -Force -Path $carpeta | Out-Null }

if ($AlFrente) {
    [CapturaDeVentana]::AlFrente($ventana.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 600
}

$resultado = [CapturaDeVentana]::Tomar($ventana.MainWindowHandle, $Salida)
if ($resultado.StartsWith('ok:')) {
    Write-Output "OK $($resultado.Substring(3)) -> $Salida"
} else {
    Write-Output "ERROR: $resultado"
    exit 1
}
