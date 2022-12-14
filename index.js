import * as THREE from 'three';
import metaversefile from 'metaversefile';


const {useApp, useFrame, useLoaders, usePhysics, useCleanup, useLocalPlayer, useActivate} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\/]*$/, '$1'); 
const treeRadius = 100;
const particleCount = 50;

export default () => {  
    let windZones = [];
    let windZoneFreq = 0;
    let windZoneForce = 0;
    let windZoneNoiseScale = 0;

    const app = useApp();
    const physics = usePhysics();
    const physicsIds = [];
    let treeTexture = null;

    const uniforms = {
        uTime: {
            value: 0,
        },
        treeTexture:{
            value: treeTexture
        },
        uWindRotation: {
            value: 0,
        },
        uWindZoneFreq: {
            value: windZoneFreq,
        },
        uWindZoneForce: {
            value: windZoneForce,
        },
        uWindZoneNoiseScale: {
            value: windZoneNoiseScale,
        },
        treePosition: {
            value: new THREE.Vector3(),
        },
    }
    const material = new THREE.MeshStandardMaterial();

    let treeMesh = null;
    (async () => {
        const u = `${baseUrl}/Webaverse_TreeForrest_Tree1_vine_leaf.glb`;
        const tree = await new Promise((accept, reject) => {
            const {gltfLoader} = useLoaders();
            gltfLoader.load(u, accept, function onprogress() {}, reject);
            
        });
        tree.scene.traverse(o => {
            if (o.isMesh && treeMesh === null) {
                treeTexture = o.material.map;
                
                treeMesh = new THREE.InstancedMesh(o.geometry, material, particleCount);
                treeMesh.geometry.setAttribute(
                    'vertexColor',
                    new THREE.BufferAttribute(new Uint16Array(o.geometry.attributes.color.array.length), 4)
                );
                const vertexColorAttribute = treeMesh.geometry.getAttribute('vertexColor');
                for(let i = 0; i < o.geometry.attributes.color.array.length; i++){
                    treeMesh.geometry.attributes.vertexColor.array[i] = o.geometry.attributes.color.array[i];
                }
                vertexColorAttribute.needsUpdate = true;
                treeMesh.geometry.attributes.vertexColor.normalized = true;
                treeMesh.frustumCulled = false;
                uniforms.treeTexture.value = treeTexture;
                treeMesh.material.onBeforeCompile = shader => {
                    shader.uniforms.uTime = uniforms.uTime;
                    shader.uniforms.treeTexture = uniforms.treeTexture;
                    shader.uniforms.uWindRotation = uniforms.uWindRotation
                    shader.uniforms.uWindZoneFreq = uniforms.uWindZoneFreq
                    shader.uniforms.uWindZoneForce = uniforms.uWindZoneForce
                    shader.uniforms.uWindZoneNoiseScale = uniforms.uWindZoneNoiseScale
                    shader.uniforms.treePosition = uniforms.treePosition

                    shader.vertexShader = 
                    `   uniform float uTime;
                        uniform float uWindRotation;
                        uniform float uWindZoneFreq;
                        uniform float uWindZoneForce;
                        uniform float uWindZoneNoiseScale;
                        uniform vec3 treePosition;
            
                        attribute vec4 vertexColor;
                        varying vec3 vPos; 
                        varying vec2 vUv;
                        vec4 quat_from_axis_angle(vec3 axis, float angle) { 
                            vec4 qr;
                            float half_angle = (angle * 0.5);
                            qr.x = axis.x * sin(half_angle);
                            qr.y = axis.y * sin(half_angle);
                            qr.z = axis.z * sin(half_angle);
                            qr.w = cos(half_angle);
                            return qr;
                        }
                
                        vec3 rotate_vertex_position(vec3 position, vec4 q) { 
                            return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
                        }

                        vec3 permute(in vec3 x) { return mod( x*x*34.+x, 289.); }

                        float snoise(in vec2 v) {
                            vec2 i = floor((v.x+v.y)*.36602540378443 + v),
                                x0 = (i.x+i.y)*.211324865405187 + v - i;
                            float s = step(x0.x,x0.y);
                            vec2 j = vec2(1.0-s,s),
                                x1 = x0 - j + .211324865405187, 
                                x3 = x0 - .577350269189626; 
                            i = mod(i,289.);
                            vec3 p = permute( permute( i.y + vec3(0, j.y, 1 ))+ i.x + vec3(0, j.x, 1 )   ),
                                m = max( .5 - vec3(dot(x0,x0), dot(x1,x1), dot(x3,x3)), 0.),
                                x = fract(p * .024390243902439) * 2. - 1.,
                                h = abs(x) - .5,
                                a0 = x - floor(x + .5);
                            return .5 + 65. * dot( pow(m,vec3(4.))*(- 0.85373472095314*( a0*a0 + h*h )+1.79284291400159 ), a0 * vec3(x0.x,x1.x,x3.x) + h * vec3(x0.y,x1.y,x3.y));
                        }
                    ` + shader.vertexShader;
                    shader.vertexShader = shader.vertexShader.replace(
                        `#include <begin_vertex>`,
                        `
                        vec3 pos = position;
                        float windFreq = uWindZoneFreq > 2. ? 2. : uWindZoneFreq;
                        float windForce = uWindZoneForce > 1.4 ? 1.4 : uWindZoneForce;

                        float windOffsetX = snoise(
                            vec2(
                                25. * uWindZoneNoiseScale * vUv.x * (1. + vertexColor.g) + uTime * 0.06 * windFreq * 0.5,
                                25. * uWindZoneNoiseScale * vUv.y * (1. + vertexColor.g) + uTime * windFreq * 0.5
                            )
                        ) * 1.;
                        float windOffsetY = snoise(
                            vec2(
                                25. * uWindZoneNoiseScale * vUv.x * (1. + vertexColor.g) + uTime * 0.06 * windFreq * 0.5,
                                25. * uWindZoneNoiseScale * vUv.y * (1. + vertexColor.g) + uTime * windFreq * 0.5
                            )
                        ) * 1.;
                        float windOffsetZ = snoise(
                            vec2(
                                25. * uWindZoneNoiseScale * vUv.x * (1. + vertexColor.g) + uTime * 0.06 * windFreq * 0.5,
                                25. * uWindZoneNoiseScale * vUv.y * (1. + vertexColor.g) + uTime * windFreq * 0.5
                            )
                        ) * 1.;

                        // red color define the foliage, the outer vertices of the leaf should have more red value.
                        // make sure only foliage have red value.
                        vec3 windOffset = vec3(windOffsetX, windOffsetY, windOffsetZ);
                        pos += windOffset * (vertexColor.r * (1. + vertexColor.g)) * 0.05 * windForce * 0.8;

                        // green value is the offset to desynchronize the rotation of the tree,
                        // we should assign different branches and corresponding foliage chunks with unique green values
                        // and make sure to paint connected pieces with the same color to avoid breaks in the mesh
                        float offsetIntensity = 1000.;
                        float noiseScale = 50. * uWindZoneNoiseScale;
                        float bendNoise = snoise(
                            vec2(
                                treePosition.x * noiseScale + uTime * 0.06 * windFreq * 0.3,
                                treePosition.z * noiseScale + uTime * windFreq * 0.3
                            )
                        ) * 1.;

                        vec3 bendOffset = vec3((0.1 + vertexColor.g) * offsetIntensity * bendNoise, 0, 0);
                        vec4 q2 = quat_from_axis_angle(vec3(0., 1., 0.), uWindRotation);
                        bendOffset = rotate_vertex_position(bendOffset / offsetIntensity, q2);

                        // blue value define the bendable part
                        // make sure to paint it with the same color horizontally to avoid breaks in the mesh
                        // make sure to paint it with linear gradient vertically to make the rotation smoothly
                        float bendable = vertexColor.b > 0. ? 1. : 0.;
                        float isFoliage = vertexColor.r > 0. ? 1.2 : 0.4;
                        
                        pos += bendOffset * 0.07 * bendable * isFoliage * windForce;
                        vec3 transformed = vec3( pos );
                        vPos = position; 
                        vUv = uv;
                        `
                    );
                    shader.fragmentShader = 
                    `
                        uniform float uTime; 
                        uniform sampler2D treeTexture; 
                        varying vec3 vPos; 
                        varying vec2 vUv;
                    ` + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader
                    .replace(
                        `vec4 diffuseColor = vec4( diffuse, opacity );`,
                        `
                        vec4 tree = texture2D(
                            treeTexture,
                            vUv
                        );
                        if(tree.a < 0.5){
                            discard;
                        }
                        vec4 diffuseColor = vec4( tree.rgb, opacity);
              
                        `
                    );
                };
                app.add(treeMesh);
                app.updateMatrixWorld();
            }
        });
    })();
    let lastLength = 0;
    let alreaySetup = false;
    const dummy = new THREE.Object3D();
    useFrame(({timestamp}) => {
        windZones = metaversefile.getWinds();
        if(lastLength !== windZones.length){
            for(const wind of windZones){
                if(wind.windType === 'directional'){
                    windZoneFreq = wind.windFrequency;
                    windZoneForce =  wind.windForce;
                    windZoneNoiseScale = wind.noiseScale;
                    break;
                }
            }
            lastLength = windZones.length;
        }
        if(treeMesh){
            if (!alreaySetup) {
                for (let i = 0; i < particleCount; i ++) {
                    dummy.position.set((Math.random() - 0.5) * treeRadius, 0, (Math.random() - 0.5) * treeRadius);
                    dummy.rotation.y = Math.random() * 2 * Math.PI;
                    const s = 0.8 + Math.random() * 0.5;
                    dummy.scale.set(s, s, s);
                    dummy.updateMatrix();
                    treeMesh.setMatrixAt(i, dummy.matrix);
                }
                alreaySetup = true;
            }

            treeMesh.instanceMatrix.needsUpdate = true;
            // if (!alreaySetup) {
            //     const positionsAttribute = treeMesh.geometry.getAttribute('positions');
            //     const rotationAttribute = treeMesh.geometry.getAttribute('rotation');
            //     const scalesAttribute = treeMesh.geometry.getAttribute('scales');
            //     for (let i = 0; i < particleCount; i ++) {
            //         positionsAttribute.setXYZ(i, (Math.random() - 0.5) * treeRadius, 0, (Math.random() - 0.5) * treeRadius);
            //         const scale = 0.8 + Math.random() * 0.5;
            //         scalesAttribute.setXYZ(i, scale, scale, scale);
            //         rotationAttribute.setX(i, Math.random() * 2 * Math.PI);
            //     }
    
            //     positionsAttribute.needsUpdate = true;
            //     scalesAttribute.needsUpdate = true;
            //     rotationAttribute.needsUpdate = true;
            //     alreaySetup = true;
            // }
            uniforms.uTime.value = timestamp /1000;
            uniforms.uWindRotation.value = ((timestamp /5000) % 1) * Math.PI * 2;
            uniforms.uWindZoneFreq.value = windZoneFreq;
            uniforms.uWindZoneForce.value = windZoneForce;
            uniforms.uWindZoneNoiseScale.value = windZoneNoiseScale;
            uniforms.treePosition.value.set(app.position.x, app.position.y, app.position.z);
        }
        app.updateMatrixWorld();
    
    });

    
    useCleanup(() => {
      for (const physicsId of physicsIds) {
        physics.removeGeometry(physicsId);
      }
    });

    return app;
}