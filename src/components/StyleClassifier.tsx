"use client";
import React, { useState } from 'react';

export default function StyleClassifier() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{class: string, confidence: number} | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setError(null);
    }
  };

  const handleClassify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/classify", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to classify image.");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center bg-white rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Dance Style Classifier (YOLOv8)</h2>
      <p className="text-gray-500 mb-8 text-center">
        Upload an image of a Thai dance to test the custom YOLOv8 model trained exclusively on your Fon Leap and Fon Mean dataset!
      </p>

      <div className="w-full flex flex-col items-center gap-6">
        <div className="w-full h-64 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden">
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Upload Preview" className="w-full h-full object-contain" />
              <button 
                onClick={() => { setFile(null); setPreviewUrl(null); setResult(null); }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black"
              >
                ×
              </button>
            </>
          ) : (
            <span className="text-gray-400 font-medium">Click below to upload</span>
          )}
        </div>
        
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange} 
          className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer" 
        />

        <button 
          onClick={handleClassify}
          disabled={!file || loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Classifying with YOLOv8..." : "Identify Dance Style"}
        </button>

        {error && (
          <div className="w-full bg-red-50 text-red-600 p-4 rounded-lg font-medium border border-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="w-full bg-green-50 text-green-800 p-6 rounded-lg border border-green-200 flex flex-col items-center">
            <h3 className="text-sm uppercase tracking-wider font-bold mb-1 opacity-70">Detection Result</h3>
            <p className="text-4xl font-black mb-2">{result.class.replace("_", " ")}</p>
            <p className="text-sm font-medium opacity-80">Confidence: {(result.confidence * 100).toFixed(1)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}
