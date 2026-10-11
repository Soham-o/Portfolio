# 🚗 End-to-End Autonomous Driving System

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue?style=for-the-badge&logo=python" />
  <img src="https://img.shields.io/badge/PyTorch-2.1+-EE4C2C?style=for-the-badge&logo=pytorch" />
  <img src="https://img.shields.io/badge/CARLA-0.9.15+-00B5E2?style=for-the-badge" />
  <img src="https://img.shields.io/badge/YOLOv11-Ultralytics-purple?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Stable--Baselines3-PPO-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Streamlit-Dashboard-FF4B4B?style=for-the-badge&logo=streamlit" />
</p>

> **Industry-grade autonomous vehicle simulation system** integrating
> deep-learning perception, rule-based + RL decision making, classical
> path planning, PID vehicle control, and a real-time Streamlit dashboard.
> Built as an AI/Autonomous Systems internship capstone portfolio project.

---

## 📋 Table of Contents

1. [Project Overview](#-project-overview)
2. [System Architecture](#-system-architecture)
3. [Module Breakdown](#-module-breakdown)
4. [Installation](#-installation)
5. [Dataset Setup](#-dataset-setup)
6. [Running the System](#-running-the-system)
7. [Training the RL Agent](#-training-the-rl-agent)
8. [Evaluation](#-evaluation)
9. [Dashboard Usage](#-dashboard-usage)
10. [Evaluation Metrics](#-evaluation-metrics)
11. [Results](#-results)
12. [Project Structure](#-project-structure)
13. [Future Improvements](#-future-improvements)
14. [References](#-references)

---

## 🎯 Project Overview

This project implements a **complete, modular autonomous driving pipeline**
capable of:

| Capability                | Implementation                         |
|---------------------------|----------------------------------------|
| Lane detection            | Hough Transform + temporal smoothing   |
| Object detection          | YOLOv11 (Ultralytics) + ByteTracker    |
| Traffic sign recognition  | YOLO + fine-grained CNN classifier     |
| Depth estimation          | Intel MiDaS (DPT_Large)               |
| Driving decisions         | Rule-based FSM + Behaviour Planner     |
| Global path planning      | A* search on occupancy grid            |
| Local path planning       | Pure Pursuit + potential fields        |
| Vehicle control           | PID + Stanley controller + AEB         |
| End-to-end RL driving     | PPO (Stable-Baselines3)                |
| Simulation                | CARLA 0.9.15+ (5 scenarios)            |
| Monitoring                | Streamlit real-time dashboard          |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CARLA Simulator                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  RGB Camera  │  │  Depth Cam   │  │  LiDAR / GNSS / IMU  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼────────────────────  ┼─────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PERCEPTION LAYER                            │
│  ┌───────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Lane Detection│ │Object Detect │ │Sign Detec│ │  Depth   │ │
│  │ (Hough+CV2)   │ │ (YOLOv11)    │ │(YOLO+CNN)│ │ (MiDaS)  │ │
│  └───────┬───────┘ └──────┬───────┘ └────┬─────┘ └────┬─────┘ │
└──────────┼────────────────┼──────────────┼─────────────┼───────┘
           │                │              │             │
           └────────────────┼──────────────┼─────────────┘
                            ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PLANNING LAYER                              │
│  ┌──────────────────┐      ┌──────────────────────────────────┐ │
│  │  Decision Engine │      │      Behavior Planner (FSM)      │ │
│  │  (Rule-based)    │      │  IDLE→LANE_FOLLOWING→INTERSECT.. │ │
│  └────────┬─────────┘      └──────────────┬───────────────────┘ │
│           │        ┌───────────────────────┘                     │
│           ▼        ▼                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Path Planner: A* Global + Pure Pursuit Local            │   │
│  └────────────────────────────┬─────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONTROL LAYER                               │
│  ┌───────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ Steering (PID+    │  │  Throttle (PID)  │  │  AEB        │  │
│  │ Stanley)          │  │  Speed control   │  │  Emergency  │  │
│  └───────────────────┘  └──────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │   RL Agent (PPO)      │ ← Optional end-to-end
                    │   Stable-Baselines3   │
                    └───────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │ Streamlit Dashboard   │
                    │ (Live monitoring)     │
                    └───────────────────────┘
```

---

## 🔩 Module Breakdown

### Perception (`perception/`)

| File | Description |
|------|-------------|
| `lane_detection.py` | Canny + Hough lane detection, temporal smoothing, lane-centre computation |
| `object_detection.py` | YOLOv11 wrapper, distance estimation, threat classification, ByteTrack |
| `traffic_sign_detection.py` | Two-stage YOLO+CNN, HSV traffic-light colour parsing |
| `depth_estimation.py` | MiDaS monocular depth, per-object distance enrichment |

### Planning (`planning/`)

| File | Description |
|------|-------------|
| `decision_engine.py` | Prioritised rule-stack: emergency brake → red light → pedestrian → follow → cruise |
| `behavior_planner.py` | Hierarchical FSM with 9 states + lane-change logic |
| `path_planner.py` | A* global planner on occupancy grid + Pure Pursuit local planner |

### Control (`control/`)

| File | Description |
|------|-------------|
| `pid_controller.py` | Generic PID with anti-windup, derivative filter, gain scheduling |
| `steering_control.py` | PID + Stanley controller fusion for lateral control |
| `throttle_control.py` | PID longitudinal control + Automatic Emergency Braking (AEB) |

### Simulation (`simulation/`)

| File | Description |
|------|-------------|
| `carla_env.py` | Gymnasium-compatible CARLA environment, 5 scenarios, reward shaping |
| `sensors.py` | Thread-safe sensor manager: RGB, depth, semantic, LiDAR, GNSS/IMU |

### RL Agent (`rl_agent/`)

| File | Description |
|------|-------------|
| `train.py` | PPO trainer with custom CNN feature extractor, EvalCallback, W&B logging |
| `evaluate.py` | Structured evaluation across all scenarios, JSON/CSV report generation |

---

## ⚙️ Installation

### Prerequisites

- Ubuntu 20.04+ or Windows 10/11
- Python 3.11+
- NVIDIA GPU with CUDA 11.8+ (recommended; CPU fallback available)
- CARLA 0.9.15 ([download](https://github.com/carla-simulator/carla/releases))

### Step 1 — Clone & Create Environment

```bash
git clone https://github.com/yourusername/autonomous-driving-system.git
cd autonomous-driving-system

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

### Step 2 — Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3 — Install CARLA Python Client

```bash
# For CARLA 0.9.15
pip install carla==0.9.15

# OR install from the CARLA PythonAPI egg (if server is local)
cd /opt/carla/PythonAPI/carla/dist
pip install carla-0.9.15-cp311-cp311-linux_x86_64.whl
```

### Step 4 — Download YOLO Weights

```bash
# YOLOv8n (auto-downloads on first run)
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Or for YOLOv11:
python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"
```

### Step 5 — Verify Installation

```bash
python main.py --mode benchmark
```

---

## 📦 Dataset Setup

### CARLA — No dataset download needed

The CARLA simulator generates synthetic sensor data in real-time.
Start the server and the system auto-collects training data.

### Optional: Pre-trained Sign Classifier

For enhanced traffic-sign classification, train the CNN on:

| Dataset | Classes | Link |
|---------|---------|------|
| German Traffic Sign (GTSRB) | 43 | [Kaggle](https://www.kaggle.com/datasets/meowmeowmeowmeowmeow/gtsrb-german-traffic-sign) |
| LISA Traffic Sign Dataset | 47 | [UCSD](http://cvrr.ucsd.edu/LISA/lisa-traffic-sign-dataset.html) |

```bash
# Prepare dataset
mkdir -p datasets/traffic_signs
# Download and extract to datasets/traffic_signs/
# Expected structure:
#   datasets/traffic_signs/
#     train/  (class_0/, class_1/, ...)
#     val/
#     test/
```

Train the sign classifier:

```bash
python scripts/train_sign_classifier.py \
  --data datasets/traffic_signs \
  --epochs 50 \
  --output models/sign_classifier.pt
```

---

## 🚀 Running the System

### 1. Start CARLA Server (separate terminal)

```bash
# Linux
cd /opt/carla
./CarlaUE4.sh -carla-server -fps=20 -ResX=1280 -ResY=720

# Windows
CarlaUE4.exe -carla-server -fps=20
```

### 2. Rule-Based Agent

```bash
# Default straight road scenario
python main.py --mode rule --scenario STRAIGHT_ROAD

# Urban traffic scenario
python main.py --mode rule --scenario DENSE_URBAN --steps 3000

# Night driving
python main.py --mode rule --scenario NIGHT_DRIVING --device cuda
```

### 3. RL Agent Inference

```bash
python main.py --mode rl \
  --model models/ppo_autonomous_driver_final \
  --scenario INTERSECTION
```

### 4. All 5 Scenarios (Sequential)

```bash
for SCENARIO in STRAIGHT_ROAD INTERSECTION PEDESTRIAN_CROSS DENSE_URBAN NIGHT_DRIVING; do
  python main.py --mode rule --scenario $SCENARIO --steps 1000
done
```

---

## 🧠 Training the RL Agent

```bash
# Quick training (testing)
python main.py --mode train --timesteps 50000 --scenario STRAIGHT_ROAD

# Full training
python main.py --mode train --timesteps 500000 --scenario DENSE_URBAN

# OR via the training script directly (more options)
python rl_agent/train.py \
  --timesteps 500000 \
  --scenario INTERSECTION

# Resume from checkpoint
python rl_agent/train.py \
  --resume models/ppo_autonomous_driver_100000_steps.zip \
  --timesteps 400000

# Monitor with TensorBoard
tensorboard --logdir results/rl_logs
```

### Reward Function

| Event | Reward |
|-------|--------|
| Lane keeping (offset < 0.5 m) | +1.0 |
| Progress toward destination | +2.0 × delta |
| Speed compliance | +0.5 |
| Smooth steering | +0.2 |
| Collision | **−5.0** + episode end |
| Lane departure | **−3.0** |
| Accident (major) | **−10.0** |

---

## 📊 Evaluation

```bash
# Evaluate all 5 scenarios (5 episodes each)
python main.py --mode eval \
  --model models/ppo_autonomous_driver_final \
  --episodes 5

# Evaluate single scenario
python rl_agent/evaluate.py \
  --model models/ppo_autonomous_driver_final \
  --scenario INTERSECTION \
  --episodes 10

# Perception latency benchmark
python main.py --mode benchmark

# View results
cat results/evaluation_report.json
```

Evaluation output: `results/evaluation_report.json`, `results/evaluation_metrics.csv`,  
`results/episode_details.csv`

---

## 📺 Dashboard Usage

```bash
streamlit run dashboard/app.py
# Opens at http://localhost:8501
```

### Dashboard Features

| Panel | Content |
|-------|---------|
| **Live Feed** | Front camera with lane + detection overlays |
| **Speed Gauge** | Real-time speedometer (0–120 km/h) |
| **Steering Gauge** | Steering angle indicator (±1.0) |
| **Warning Panel** | AEB, collision, lane departure, overspeed alerts |
| **Drive State** | Current FSM state (CRUISING / EMERGENCY_BRAKE / ...) |
| **Metrics Tab** | Rolling speed, steer, reward, FPS time-series charts |
| **Detections Tab** | Live detection table + class distribution chart |
| **Evaluation Tab** | Loaded evaluation report with scenario bar charts |
| **System Info Tab** | Architecture overview, quick-start guide |

---

## 📈 Evaluation Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Collision Rate** | Collisions / episode | < 0.1 |
| **Lane Keeping Accuracy** | Steps within 0.5m / total steps | > 85% |
| **Success Rate** | Episodes without collision & > 80% route | > 70% |
| **Route Completion** | Steps completed / max steps | > 80% |
| **Average Speed** | Mean speed (km/h) during episode | ≈ cruise target |
| **Inference Latency** | Per-module forward pass (ms) | < 50ms/frame |
| **Detection mAP** | YOLO mAP@0.5 on test set | > 0.75 |

---

## 📁 Project Structure

```
autonomous_driving/
│
├── perception/                 # Sensing & interpretation
│   ├── lane_detection.py       # Hough-transform lane detector
│   ├── object_detection.py     # YOLOv11 multi-class detector
│   ├── traffic_sign_detection.py # YOLO + CNN sign classifier
│   └── depth_estimation.py    # MiDaS monocular depth
│
├── planning/                   # Intelligence layer
│   ├── decision_engine.py      # Rule-based priority engine
│   ├── behavior_planner.py     # FSM behavior planner
│   └── path_planner.py         # A* + Pure Pursuit planner
│
├── control/                    # Actuation
│   ├── pid_controller.py       # Generic PID controller
│   └── steering_control.py     # Steering + Throttle + AEB
│
├── simulation/                 # CARLA interface
│   ├── carla_env.py            # Gymnasium environment
│   └── sensors.py              # Sensor manager
│
├── rl_agent/                   # Reinforcement learning
│   ├── train.py                # PPO training pipeline
│   └── evaluate.py             # Evaluation & benchmarking
│
├── dashboard/                  # Monitoring
│   └── app.py                  # Streamlit dashboard
│
├── configs/
│   └── config.yaml             # Central configuration
│
├── models/                     # Trained weights
├── datasets/                   # Training data
├── results/                    # Logs, reports, checkpoints
│
├── main.py                     # System orchestrator + CLI
├── requirements.txt
└── README.md
```

---

## 🔮 Future Improvements

- [ ] **Semantic Segmentation** — Replace Hough lanes with DeepLabV3+/SegFormer drivable-area mask
- [ ] **Transformer Perception** — DETR / BEVFormer for multi-view object detection
- [ ] **Multi-Camera Fusion** — 360° surround-view with BEV projection
- [ ] **LiDAR Integration** — PointPillar / VoxelNet for LiDAR object detection
- [ ] **HD Map Integration** — OpenDRIVE map parsing for precise path planning
- [ ] **V2X Communication** — Vehicle-to-infrastructure signal simulation
- [ ] **Driver Monitoring** — Drowsiness / distraction detection
- [ ] **Imitation Learning** — Pre-training from expert CARLA demonstrations
- [ ] **Uncertainty Estimation** — Bayesian detection confidence for safety
- [ ] **Real-world Deployment** — ROS2 + Autoware.Universe integration

---

## 📚 References

1. Dosovitskiy et al. (2017) — [CARLA: An Open Urban Driving Simulator](https://arxiv.org/abs/1711.03938)
2. Redmon et al. — [YOLO: Real-Time Object Detection](https://arxiv.org/abs/1506.02640)
3. Ranftl et al. (2021) — [Vision Transformers for Dense Prediction (MiDaS)](https://arxiv.org/abs/2103.13413)
4. Schulman et al. (2017) — [Proximal Policy Optimization](https://arxiv.org/abs/1707.06347)
5. Coulter (1992) — Pure Pursuit Path Tracking
6. Hart, Nilsson, Raphael (1968) — A* Search Algorithm

---

## 👨‍💻 Author

Built as an **AI/Autonomous Systems Internship Capstone Project**.  
Demonstrates mastery of: deep learning · computer vision · robotics · reinforcement learning · simulation · software engineering.

**Tech Stack:** Python · PyTorch · OpenCV · Ultralytics YOLOv11 · MiDaS · Stable-Baselines3 · CARLA · Streamlit · NumPy · Pandas

---

<p align="center">
  ⭐ Star this repo if it helped you! · 🍴 Fork it for your own project
</p>
