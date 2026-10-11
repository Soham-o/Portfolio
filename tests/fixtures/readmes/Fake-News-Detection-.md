# 📰 Fake News Detection (TF-IDF & Logistic Regression)

A lightweight Machine Learning project to detect fake news articles using Scikit-Learn. This system uses **TF-IDF (Term Frequency-Inverse Document Frequency)** for feature extraction and **Logistic Regression** for classification, offering high accuracy with minimal computational cost.

## 🚀 Project Overview
Misinformation is a growing problem in the digital age. This project builds a binary classifier to distinguish between:
* **Real News:** Verified articles from legitimate sources.
* **Fake News:** Fabricated stories intended to deceive.

## 🛠️ Tech Stack
* **Python 3.x**
* **Pandas & NumPy:** For efficient data manipulation.
* **Scikit-Learn:**
    * `TfidfVectorizer`: Converts text into numerical vectors based on word importance.
    * `LogisticRegression`: A robust linear model for binary classification.
    * `Pipeline`: Streamlines the training process.

## 📂 Dataset Structure
The project expects two CSV files in the root directory:
https://www.kaggle.com/datasets/clmentbisaillon/fake-and-real-news-dataset

*Note: The dataset is typically sourced from the ISOT Fake News Dataset or Kaggle.*

## ⚙️ Installation

1.  **Clone the repository**
    ```bash
    [git clone [https://github.com/Soham-o/fake-news-detection.git](https://github.com/Soham-o/fake-news-detection.git)
    cd fake-news-detection](https://github.com/Soham-o/Fake-News-Detection-.git)
    ```

2.  **Install Dependencies**
    You can install the required libraries using pip:
    ```bash
    pip install pandas numpy scikit-learn
    ```

## 🧠 How It Works
The code follows a clean 4-step pipeline:
1.  **Data Loading & Cleaning:**
    * Loads the raw CSV files.
    * Assigns labels (1 for True, 0 for Fake).
    * Combines, shuffles, and removes duplicate entries to prevent data leakage.
2.  **Preprocessing (TF-IDF):**
    * Converts raw text into a matrix of TF-IDF features.
    * This statistically measures how important a word is to a document in the corpus.
3.  **Model Training:**
    * The processed vectors are fed into a **Logistic Regression** classifier.
4.  **Evaluation:**
    * Outputs the accuracy score and a detailed classification report (Precision, Recall, F1-Score).

## 🏃‍♂️ Usage

To run the project, simply execute the python script:

```bash
python main.ipynb
