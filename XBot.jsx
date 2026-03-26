/* eslint-disable react/no-unknown-property */
import React, { useRef, useEffect, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// We match these exactly to the keys in your JSON files
const SIGNING_BONES = [
  "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand",
  "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand",
  "mixamorigRightHandThumb1", "mixamorigRightHandThumb2", "mixamorigRightHandThumb3",
  "mixamorigRightHandIndex1", "mixamorigRightHandIndex2", "mixamorigRightHandIndex3",
  "mixamorigRightHandMiddle1", "mixamorigRightHandMiddle2", "mixamorigRightHandMiddle3",
  "mixamorigRightHandRing1", "mixamorigRightHandRing2", "mixamorigRightHandRing3",
  "mixamorigRightHandPinky1", "mixamorigRightHandPinky2", "mixamorigRightHandPinky3",
  "mixamorigLeftHandThumb1", "mixamorigLeftHandThumb2", "mixamorigLeftHandThumb3",
  "mixamorigLeftHandIndex1", "mixamorigLeftHandIndex2", "mixamorigLeftHandIndex3",
  "mixamorigLeftHandMiddle1", "mixamorigLeftHandMiddle2", "mixamorigLeftHandMiddle3",
  "mixamorigLeftHandRing1", "mixamorigLeftHandRing2", "mixamorigLeftHandRing3",
  "mixamorigLeftHandPinky1", "mixamorigLeftHandPinky2", "mixamorigLeftHandPinky3"
];

export function Model({ status, transcript,replayTrigger ,...props }) {
  const { scene } = useGLTF('/Michelle.glb')
  const bones = useRef({})
  
  const [currentQueue, setCurrentQueue] = useState([]) 
  const [activeSignIndex, setActiveSignIndex] = useState(0)
  const frameIndex = useRef(0)
  const frameTimer = useRef(0)
  const FRAME_DURATION = 0.1 // Matches your 5-keyframe style (~10fps)

  useEffect(() => {
    if (!scene) return
    scene.traverse((obj) => {
      if (obj.isBone) bones.current[obj.name] = obj
    })
  }, [scene])

  useEffect(() => {
    if (!transcript || status !== 'success') {
      setCurrentQueue([])
      return
    }

    const words = transcript.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/)
    
    const loadSigns = async () => {
      const loadedData = []
      
      for (const word of words) {
        if (!word) continue;
        
        let foundWord = false;
        
        try {
          // 1. Try to fetch the full word
          const response = await fetch(`/landmarks/${word}.json`)
          
          // Check specifically for the JSON content type to avoid the <!doctype html error
          const contentType = response.headers.get("content-type");
          
          if (response.ok && contentType && contentType.includes("application/json")) {
            const data = await response.json()
            loadedData.push(data)
            foundWord = true;
          } 
        } catch (err) {
          console.warn(`Word "${word}" not found as a full sign.`)
        }

        // 2. FALLBACK: If word wasn't found, load letter by letter
        if (!foundWord) {
          console.log(`Switching to fingerspelling for: ${word}`)
          for (const letter of word) {
            if (!/[a-z0-9]/.test(letter)) continue;
            
            try {
              const letterResponse = await fetch(`/landmarks/${letter}.json`);
              const letterType = letterResponse.headers.get("content-type");

              if (letterResponse.ok && letterType?.includes("application/json")) {
                const letterData = await letterResponse.json();
                letterData._isFingerspell = true; // Mark this data as fingerspelling for later use if needed
                loadedData.push(letterData);
                // ADD THIS LOG:
                console.log(`✅ Loaded letter: ${letter}`); 
              } else {
                console.error(`❌ Could not find letter file: /landmarks/${letter}.json`);
              }
            } catch (err) {
              console.error(`Error fetching letter ${letter}:`, err);
            }
          }
        }
      }
      
      if (loadedData.length > 0) {
        setCurrentQueue(loadedData)
        setActiveSignIndex(0)
        frameIndex.current = 0
        frameTimer.current = 0
      }
    }
    
    loadSigns()
  }, [transcript, status, replayTrigger])

  useFrame((state, delta) => {
    if (Object.keys(bones.current).length === 0) return

    const currentSignData = currentQueue[activeSignIndex]

    if (status === 'success' && currentSignData) {
      frameTimer.current += delta
      
      const adaptiveDuration = currentSignData._isFingerspell ? 0.4 : FRAME_DURATION;

      if (frameTimer.current >= adaptiveDuration) {
        frameTimer.current = 0
        
        // Dynamic check for keyframe length (e.g., your JSON has 5)
        const firstBoneInJson = Object.keys(currentSignData).find(key => !key.startsWith('_'));
        const totalFrames = currentSignData[firstBoneInJson]?.keyframes.length || 0;

        if (frameIndex.current < totalFrames - 1) {
          frameIndex.current++;
        } else {
          if (activeSignIndex < currentQueue.length - 1) {
            // RESET INDEX FIRST
            frameIndex.current = 0; 
            setActiveSignIndex(prev => prev + 1);
          }
        }
      }

      const f = frameIndex.current

      // Apply rotations only to bones present in BOTH the JSON and the Model
      Object.keys(currentSignData).forEach((boneName) => {
        // 1. Skip our internal tags (like _isFingerspell)
        if (boneName.startsWith('_')) return;

        const bone = bones.current[boneName];
        const signBonesData = currentSignData[boneName];
        
        // 2. Safety Gate: Check if the bone data and keyframes array actually exist
        if (bone && signBonesData && signBonesData.keyframes) {
          const kf = signBonesData.keyframes[f];
          
          // 3. Final Safety: Check if this specific keyframe exists
          if (kf) {
            bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, kf[0] || 0, 0.15);
            bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, kf[1] || 0, 0.15);
            bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, kf[2] || 0, 0.15);
          }
        }
      });

    } else {
      // Return to neutral pose smoothly for all finger and arm bones
      SIGNING_BONES.forEach((name) => {
        const bone = bones.current[name]
        if (bone) {
          bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, 0, 0.05)
          bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, 0, 0.05)
          bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, 0, 0.05)
        }
      })
    }
  })

  return <primitive object={scene} scale={[1, 1, 1]} {...props} />
}

useGLTF.preload('/Michelle.glb')