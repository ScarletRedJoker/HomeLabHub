FROM dorowu/ubuntu-desktop-lxde-vnc:latest

ENV DEBIAN_FRONTEND=noninteractive \
    VNC_USER=evin \
    USER_UID=1000 \
    USER_GID=1000 \
    INSTALL_STEAM=true

USER root

# Fix: Remove problematic Chrome repo that has GPG key issues
RUN rm -f /etc/apt/sources.list.d/google-chrome.list || true

# Enable 32-bit architecture for Steam
RUN dpkg --add-architecture i386

# Install all applications in organized groups
RUN apt-get update && apt-get install -y \
    # Web Browsers
    firefox \
    chromium-browser \
    # Terminal & File Management
    gnome-terminal \
    thunar \
    mousepad \
    gedit \
    # Graphics & Media
    gimp \
    vlc \
    obs-studio \
    audacity \
    # Office Suite
    libreoffice \
    evince \
    # Development Tools
    git \
    curl \
    wget \
    vim \
    nano \
    build-essential \
    tmux \
    openssh-client \
    # System Monitoring
    htop \
    neofetch \
    glances \
    gnome-system-monitor \
    nmap \
    net-tools \
    # Programming Languages
    python3 \
    python3-pip \
    nodejs \
    npm \
    # Desktop Integration
    dbus-x11 \
    gvfs \
    gvfs-backends \
    xdg-desktop-portal \
    xdg-desktop-portal-gtk \
    xdg-utils \
    xdg-user-dirs \
    desktop-file-utils \
    # Security & Passwords
    keepassxc \
    # Remote Desktop
    remmina \
    remmina-plugin-rdp \
    remmina-plugin-vnc \
    # System Libraries
    procps \
    software-properties-common \
    # 32-bit libraries for Steam
    lib32gcc-s1 \
    lib32stdc++6 \
    libc6-i386 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Steam (optional, can be disabled with INSTALL_STEAM=false)
RUN if [ "$INSTALL_STEAM" = "true" ]; then \
        apt-get update && \
        apt-get install -y steam-installer && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*; \
    fi

# Configure VLC for Docker containers (disable hardware acceleration)
RUN mkdir -p /root/.config/vlc && \
    echo '# VLC Docker Configuration - Disable hardware acceleration' > /root/.config/vlc/vlcrc && \
    echo 'avcodec-hw=none' >> /root/.config/vlc/vlcrc && \
    echo 'vout=x11' >> /root/.config/vlc/vlcrc && \
    echo 'no-video-title-show=1' >> /root/.config/vlc/vlcrc

# Create user
RUN groupadd -g ${USER_GID} ${VNC_USER} || true && \
    useradd -m -u ${USER_UID} -g ${USER_GID} -s /bin/bash ${VNC_USER} || usermod -l ${VNC_USER} ubuntu

# Copy bootstrap script and desktop shortcuts
COPY bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

COPY desktop-shortcuts /tmp/desktop-shortcuts

# Create user directories
USER ${VNC_USER}

RUN mkdir -p /home/${VNC_USER}/.config/lxpanel/LXDE/panels && \
    mkdir -p /home/${VNC_USER}/Desktop && \
    mkdir -p /home/${VNC_USER}/.local/share/applications

USER root

ENTRYPOINT ["/bin/bash", "-c", "/usr/local/bin/bootstrap.sh && /startup.sh"]
