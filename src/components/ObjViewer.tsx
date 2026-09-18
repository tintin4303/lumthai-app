import React from 'react';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

export function ObjModel({ url }: { url: string }) {
  const mtlUrl = url.replace('.obj', '.mtl');
  
  const materials = useLoader(MTLLoader, mtlUrl);
  
  const obj = useLoader(OBJLoader, url, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });
  
  return <primitive object={obj} />;
}
