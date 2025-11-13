function connectNoVNC() {
    const url = document.getElementById('novncUrl').value;
    
    if (!url) {
        alert('Please enter a noVNC URL');
        return;
    }
    
    window.open(url, '_blank');
    
    const frame = document.getElementById('desktopFrame');
    frame.innerHTML = `<iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>`;
}
