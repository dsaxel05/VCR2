# Install Docker Desktop (Windows 11), for the accounts tests

Why: the accounts tests run against a private copy of Supabase on your own PC (no real accounts, no money). That copy runs inside Docker.
Cost: free for personal use and for companies under 250 employees and under $10 million revenue ([licence](https://docs.docker.com/subscription-billing/desktop-license/)).
Your PC today: virtualisation is on, 16 GB of memory, WSL is not installed yet (the installer adds it).

1. Open Microsoft Edge and go to https://docs.docker.com/desktop/setup/install/windows-install/
2. Click the blue button **Docker Desktop for Windows - x86_64**. The file `Docker Desktop Installer.exe` downloads.
3. Open the **Downloads** folder (Windows key, type `Downloads`, Enter) and double-click `Docker Desktop Installer.exe`.
4. Windows asks "Do you want to allow this app to make changes to your device?": click **Yes**.
5. On the "Configuration" screen, leave **Use WSL 2 instead of Hyper-V (recommended)** ticked and click **OK**. Wait (several minutes).
6. When it says "Installation succeeded", click **Close and restart**. Save your work first: the PC restarts.
7. After the restart, Docker Desktop opens by itself. Read the Docker Subscription Service Agreement and click **Accept** if you agree.
8. If it asks you to sign in or to answer a survey, click **Skip** (no Docker account needed).
9. If a black window says WSL must be updated, press any key and let it finish, then open Docker Desktop again from the Start menu.
10. Wait until the bottom-left corner of Docker Desktop shows **Engine running** in green.
11. Optional, to save memory when you do not test: Docker Desktop, gear icon (top right), **General**, untick **Start Docker Desktop when you sign in to your computer**, click **Apply**.
12. Tell Claude: "Docker est prêt". Claude then starts the local stack itself (`node tools/accounts_stack.mjs start`); the first start downloads the Supabase images and takes a while.

Docker Desktop must be open (Engine running) each time the accounts tests run.

## If the installer says "Installation failed. One prerequisite is not fulfilled" ("Virtual Machine Platform")
Seen on Axel's PC on 2026-11-09 with Docker Desktop 4.99.0. Windows needs one feature switched on first, which requires administrator rights.
1. Click **Close** on the Docker window.
2. Press the Windows key, type `PowerShell`. On the right, click **Run as administrator** (French: **Exécuter en tant qu'administrateur**), then **Yes** (**Oui**).
3. In the blue window, type `wsl --install --no-distribution` and press Enter. (`--no-distribution` installs only what Docker needs, no Linux system and no extra password.)
4. Wait for the message saying the operation completed (it may ask for a restart). Close the window.
5. Restart the PC: Start menu, power icon, **Restart** (**Redémarrer**).
6. Open **Downloads**, double-click `Docker Desktop Installer.exe` again and continue at step 4 above.
