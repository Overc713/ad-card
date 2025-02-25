import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';

// ==================== 新增：环境检测 ====================
if (!window.isSecureContext && !location.hostname.endsWith('.localhost')) {
    document.getElementById('arButton').disabled = true;
    alert('必须通过HTTPS或localhost访问');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: 'low-power' // 新增：移动端省电模式
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ==================== 模型加载优化 ====================
let arObject = null;
const loader = new GLTFLoader();
document.querySelector('.loader').style.display = 'block';

loader.load(
    'cup.glb', // 建议使用CDN
    (gltf) => {
        arObject = gltf.scene;
        arObject.scale.set(0.5, 0.5, 0.5);
        arObject.visible = false;
        scene.add(arObject);
        document.querySelector('.loader').style.display = 'none';
    },
    (xhr) => {
        console.log(`模型加载进度: ${(xhr.loaded / xhr.total * 100).toFixed(2)}%`);
    },
    (error) => {
        console.error('模型加载失败:', error);
        document.querySelector('.loader').style.display = 'none';
    }
);

// ==================== AR核心逻辑重构 ====================
let currentSession = null;
let hitTestSource = null;
let reticle = null;

async function startAR() {
    try {
        // 新增：浏览器兼容性深度检测
        if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-ar')) {
            alert('请使用Chrome 81+/Safari 14+访问');
            return;
        }

        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test', 'dom-overlay', 'local-floor'],
            optionalFeatures: ['accelerometer', 'gyroscope'],
            domOverlay: { root: document.body }
        });

        currentSession = session;
        await renderer.xr.setSession(session);
        document.getElementById('arButton').style.display = 'none';
        
        // 新增：参考空间初始化
        const referenceSpace = await session.requestReferenceSpace('local-floor');
        
        // 初始化平面检测
        reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.1, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        reticle.visible = false;
        scene.add(reticle);

        // 新增：持续hit-test
        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
            hitTestSource = source;
        });

        // 手势交互优化（新增节流）
        let lastScaleTime = 0;
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && arObject) {
                if (Date.now() - lastScaleTime < 100) return;
                lastScaleTime = Date.now();

                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.hypot(
                    touch1.clientX - touch2.clientX,
                    touch1.clientY - touch2.clientY
                );
                const scale = THREE.MathUtils.clamp(distance * 0.001, 0.3, 1.5);
                arObject.scale.set(scale, scale, scale);
            }
        });

        // 放置逻辑优化
        session.addEventListener('select', () => {
            if (!arObject || !reticle.visible) return;
            
            arObject.position.copy(reticle.position);
            arObject.quaternion.copy(reticle.quaternion);
            arObject.visible = true;
            scene.remove(reticle);
        });

        // 新增：会话结束处理
        session.addEventListener('end', () => {
            scene.remove(reticle);
            if (arObject) arObject.visible = false;
            document.getElementById('arButton').style.display = 'block';
            currentSession = null;
        });

    } catch (e) {
        console.error('AR错误详情:', e);
        alert(`AR启动失败: ${e.message}`);
    }
}

// ==================== 动画循环优化 ====================
renderer.setAnimationLoop((timestamp, frame) => {
    if (!frame || !hitTestSource || !reticle) return;

    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
        const pose = hitTestResults[0].getPose(referenceSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
    }

    if (arObject && arObject.visible) {
        arObject.rotation.y += 0.005;
    }
    
    renderer.render(scene, camera);
});

// ==================== 启动逻辑加固 ====================
document.getElementById('arButton').addEventListener('click', () => {
    if (document.readyState === 'complete') {
        startAR();
    } else {
        window.addEventListener('load', startAR);
    }
});

// 新增：窗口尺寸自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});