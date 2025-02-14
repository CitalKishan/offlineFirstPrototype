import { useState, useEffect } from "react";
import {
  View,
  Button,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { createClient } from "@supabase/supabase-js";

// Supabase Config
const supabaseUrl = "https://qaxynrlmloqlqypcmcai.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFheHlucmxtbG9xbHF5cGNtY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkzNTczODksImV4cCI6MjA1NDkzMzM4OX0.biLc3PWK3fw2OjLKHN5fVDoc8SKQKUb-GSYYe0l-J7w";
const supabase = createClient(supabaseUrl, supabaseKey);
const bucketName = "images";

// Theme Config
const theme = {
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    primary: "#BB86FC",
    text: "#FFFFFF",
    error: "#CF6679",
    overlay: "rgba(0,0,0,0.9)",
  },
};

export default function App() {
  const [savedImages, setSavedImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadSavedImages();
  }, []);

  const loadSavedImages = async () => {
    const saved = await AsyncStorage.getItem("savedImages");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validImages = parsed.filter((img) => img.uri);
        setSavedImages(validImages);
      } catch (error) {
        console.error("Error loading images:", error);
        setSavedImages([]);
      }
    }
  };

  const uploadToSupabase = async (imageUri, fileName) => {
    try {
      const imageData = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, Buffer.from(imageData, "base64"), {
          contentType: "image/jpeg",
        });

      if (error) {
        console.error("Error uploading to Supabase:", error);
        Alert.alert("Upload Failed", "Could not upload image to cloud.");
      } else {
        Alert.alert("Success", "Image uploaded to cloud storage.");
        console.log("Uploaded:", data);
      }
    } catch (error) {
      console.error("Upload Error:", error);
      Alert.alert("Error", "Something went wrong while uploading.");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      const fileName = `${Date.now()}.jpg`;
      const newPath = FileSystem.documentDirectory + fileName;

      await FileSystem.copyAsync({ from: localUri, to: newPath });

      const newImage = { uri: newPath };
      const updatedImages = [newImage, ...savedImages];

      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      Alert.alert("Success", "Image saved locally. Uploading to cloud...");

      await uploadToSupabase(newPath, fileName);
    }
  };

  const deleteImage = async (index) => {
    const updatedImages = savedImages.filter((_, i) => i !== index);
    setSavedImages(updatedImages);
    await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));
  };

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.dark.background,
      }}
    >
      <Button
        title="Choose Image"
        onPress={pickImage}
        color={theme.dark.primary}
      />
      <View style={{ marginVertical: 10 }} />
      <Button
        title="Show Images"
        onPress={() => setModalVisible(true)}
        color={theme.dark.primary}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.dark.overlay,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "90%",
              backgroundColor: theme.dark.surface,
              padding: 20,
              borderRadius: 10,
              maxHeight: "80%",
            }}
          >
            <ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {savedImages.map((img, index) => (
                  <View key={index} style={{ position: "relative", margin: 5 }}>
                    {img.uri ? (
                      <>
                        <Image
                          source={{ uri: img.uri }}
                          style={{ width: 100, height: 100, borderRadius: 5 }}
                        />
                        <TouchableOpacity
                          style={{
                            position: "absolute",
                            top: 5,
                            right: 5,
                            backgroundColor: theme.dark.error,
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                          onPress={() => deleteImage(index)}
                        >
                          <Text
                            style={{
                              color: theme.dark.text,
                              fontSize: 16,
                              fontWeight: "bold",
                            }}
                          >
                            ×
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Button
              title="Close"
              onPress={() => setModalVisible(false)}
              color={theme.dark.primary}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
