🏠 Project 1: California Housing Price Predictor (hpd.ipynb)
A linear regression model designed to predict the median house value based on various geographical and demographic features. This project demonstrates how to handle mixed data types (numerical and categorical) within a single processing pipeline.

🛠️ Key Technical Features
Data Handling: Implements a HousingModel class structure for modularity.

Advanced Preprocessing: Uses ColumnTransformer to apply different transformations to specific subsets of features:

Numerical Data: Median imputation for missing values followed by Standard Scaling.

Categorical Data: One-Hot Encoding (with handle_unknown='ignore') for the ocean_proximity feature.

Model: Linear Regression.

📊 Performance
The model was evaluated on a 20% test split: | Metric | Value | | :--- | :--- | | RMSE | ~$70,059 | | R² Score | 0.6254 |

📧 Project 2: Spam Mail Classifier (smd.ipynb)
A Natural Language Processing (NLP) classifier capable of distinguishing between "Spam" and "Ham" (legitimate) emails. This project moves beyond simple structured data into text mining and probability-based classification.

🛠️ Key Technical Features
Text Cleaning: Custom Regex implementation to remove non-alphabetic characters.

NLP Pipeline:

Tokenization & Lowercasing.

Stopword Removal: Utilizing NLTK's corpus to remove noise words.

Stemming: Applied PorterStemmer to reduce words to their root form.

Vectorization: transformed text data using TfidfVectorizer (Term Frequency-Inverse Document Frequency).

Model: Multinomial Naive Bayes (MultinomialNB), chosen for its efficiency in high-dimensional text data.

Stratification: Utilized stratified splitting to maintain class balance in the test set.

📊 Performance
The model achieved high accuracy on the test dataset: | Metric | Value | | :--- | :--- | | Accuracy | 98.12% | | Precision (Class 0) | 1.00 | | Recall (Class 1) | 1.00 |

💻 Installation & Usage
To run these notebooks locally, ensure you have the required dependencies installed.

1. Clone the Repository
Bash
git clone [https://github.com/yourusername/mini-ml-projects.git](https://github.com/Soham-o/MLmini_Projects.git)
cd MLmini_Projects
2. Install Dependencies
You can install the necessary libraries using pip:

Bash
pip install pandas numpy scikit-learn nltk matplotlib
3. Run the Projects
Launch Jupyter Notebook to view and run the analysis:

Bash
jupyter notebook
Open hpd.ipynb for the Housing Regression model.

Open smd.ipynb for the Spam Classification model.

📂 Repository Structure
Plaintext
├── hpd.ipynb        # Housing Price Prediction (Source Code)
├── smd.ipynb        # Spam Mail Detection (Source Code)
├── house.csv        # Dataset for Housing Project (Required)
├── es_data.csv      # Dataset for Spam Project (Required)
└── README.md        # Project Documentation
🚀 Future Improvements
Housing Model: Experiment with RandomForestRegressor or XGBoost to capture non-linear relationships and improve the R² score.

Spam Model: Implement Deep Learning techniques (LSTM or BERT) to improve context understanding for edge cases where Naive Bayes might fail.

Deployment: Wrap the models in a Flask/FastAPI backend for real-time inference.
