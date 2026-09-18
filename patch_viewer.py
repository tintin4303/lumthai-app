import sys
with open('src/components/TripoMeshViewer.tsx', 'r') as f:
    content = f.read()

# Replace VolumeMesh with PointCloudScene
old_mesh = """// Component that takes RGBA texture and Depth texture and renders a 2.5D mesh
function VolumeMesh({ rgbaB64, depthB64 }: { rgbaB64: string, depthB64: string }) {
  const [colorMap, depthMap] = useLoader(THREE.TextureLoader, [
    `data:image/png;base64,${rgbaB64}`,
    `data:image/png;base64,${depthB64}`
  ]);

  const aspect = colorMap.image.width / colorMap.image.height;

  return (
    <mesh position={[0, 0, 0]}>
      {/* High-segment plane for smooth displacement */}
      <planeGeometry args={[2 * aspect, 2, 256, 256]} />
      <meshStandardMaterial
        map={colorMap}
        transparent={true}
        alphaTest={0.1}
        displacementMap={depthMap}
        displacementScale={0.3} // Bulge outwards based on depth
        side={THREE.DoubleSide}
        roughness={0.8}
      />
    </mesh>
  );
}"""

new_mesh = """// Uses the exact PointCloud algorithm from the original pipeline,
// but optimized for the isolated RGBA dancer.
function PointCloudScene({ rgbaB64, depthB64 }: { rgbaB64: string, depthB64: string }) {
  const texture = useLoader(THREE.TextureLoader, `data:image/png;base64,${rgbaB64}`);
  const depthTex = useLoader(THREE.TextureLoader, `data:image/png;base64,${depthB64}`);

  const geometry = useMemo(() => {
    const img = texture.image;
    const dep = depthTex.image;
    if (!img?.width || !dep?.width) return new THREE.BufferGeometry();

    const SAMPLE = 2; // High detail point cloud
    const cw = img.naturalWidth || img.width;
    const ch = img.naturalHeight || img.height;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = cw; colorCanvas.height = ch;
    const colorCtx = colorCanvas.getContext('2d')!;
    colorCtx.drawImage(img, 0, 0, cw, ch);
    const colorData = colorCtx.getImageData(0, 0, cw, ch).data;

    const depCanvas = document.createElement('canvas');
    depCanvas.width = cw; depCanvas.height = ch;
    const depCtx = depCanvas.getContext('2d')!;
    depCtx.drawImage(dep, 0, 0, cw, ch);
    const depData = depCtx.getImageData(0, 0, cw, ch).data;

    const posArr: number[] = [];
    const colArr: number[] = [];

    const aspect = cw / ch;
    const W = 4 * aspect;
    const H = 4;
    const DEPTH_SCALE = 1.0; // The physical thickness of the point cloud

    for (let py = 0; py < ch; py += SAMPLE) {
      for (let px = 0; px < cw; px += SAMPLE) {
        const i = (py * cw + px) * 4;
        
        // Skip transparent background pixels
        if (colorData[i + 3] < 10) continue; 
        
        const depthVal = depData[i]; // Depth (0 = background, pushed to 255)
        // Skip background depth pixels that were masked out
        if (depthVal < 10) continue;

        // Map pixel to 3D space
        const x = (px / cw) * W - W / 2;
        const y = -(py / ch) * H + H / 2;
        
        // 255 is close, 0 is far
        const z = (depthVal / 255) * DEPTH_SCALE - (DEPTH_SCALE / 2);

        posArr.push(x, y, z);
        colArr.push(colorData[i] / 255, colorData[i+1] / 255, colorData[i+2] / 255);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    return geo;
  }, [texture, depthTex]);

  return (
    <points>
      <primitive object={geometry} />
      <pointsMaterial size={0.02} vertexColors sizeAttenuation />
    </points>
  );
}"""

content = content.replace(old_mesh, new_mesh)
content = content.replace("<VolumeMesh", "<PointCloudScene")

with open('src/components/TripoMeshViewer.tsx', 'w') as f:
    f.write(content)
