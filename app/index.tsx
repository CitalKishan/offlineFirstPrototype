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
  StatusBar,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { createClient } from "@supabase/supabase-js";
import NetInfo from "@react-native-community/netinfo";
import { configData } from "../config";

// Initialize Supabase client
const supabase = createClient(
  configData.supabase.url,
  configData.supabase.anonKey
);

const theme = {
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    primary: "#BB86FC",
    text: "#FFFFFF",
    error: "#CF6679",
    overlay: "rgba(0,0,0,0.9)",
    success: "#4CAF50",
    warning: "#FF9800",
  },
};

export default function App() {
  const [savedImages, setSavedImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    loadSavedImages();

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });

    // Check initial connection
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected);
    });

    return () => {
      unsubscribe();
    };
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

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled) {
      try {
        const localUri = result.assets[0].uri;
        const fileType = localUri.split(".").pop();
        const fileName = `${Date.now()}.${fileType}`;
        const newPath = FileSystem.documentDirectory + fileName;

        // Save locally
        await FileSystem.copyAsync({ from: localUri, to: newPath });

        // Prepare FormData for Supabase upload
        const formData = new FormData();
        formData.append("file", {
          uri: newPath,
          name: fileName,
          type: `image/${fileType}`,
        });

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from("images")
          .upload(fileName, formData);

        if (error) throw error;

        // Get public URL of uploaded image
        const {
          data: { publicUrl },
        } = supabase.storage.from("images").getPublicUrl(fileName);

        const newImage = {
          uri: newPath,
          supabaseUrl: publicUrl,
        };

        // Update state and save locally
        const updatedImages = [newImage, ...savedImages];
        setSavedImages(updatedImages);
        await AsyncStorage.setItem(
          "savedImages",
          JSON.stringify(updatedImages)
        );

        Alert.alert("Success", "Image uploaded successfully!");
      } catch (error) {
        console.error("Upload error:", error);
        Alert.alert("Error", "Failed to upload image. Please try again.");
      }
    }
  };

  const deleteImage = async (index) => {
    try {
      const imageToDelete = savedImages[index];

      // Delete from Supabase if we have a supabaseUrl
      if (imageToDelete.supabaseUrl) {
        // Extract filename from the URL
        const fileName = imageToDelete.supabaseUrl.split("/").pop();
        if (fileName) {
          const { error: deleteError } = await supabase.storage
            .from("images")
            .remove([fileName]);

          if (deleteError) {
            console.error("Error deleting from Supabase:", deleteError);
            Alert.alert(
              "Warning",
              "Failed to delete from cloud storage, but deleted locally."
            );
          }
        }
      }

      // Delete locally
      const updatedImages = savedImages.filter((_, i) => i !== index);
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));
      Alert.alert("Success", "Image deleted successfully!");
    } catch (error) {
      console.error("Delete error:", error);
      Alert.alert("Error", "Failed to delete image. Please try again.");
    }
  };

  // Network status indicator component
  const NetworkIndicator = () => (
    <View
      style={{
        position: "absolute",
        top: StatusBar.currentHeight || 0,
        left: 0,
        right: 0,
        backgroundColor: isConnected ? theme.dark.success : theme.dark.warning,
        padding: 5,
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <Text style={{ color: theme.dark.text, fontWeight: "bold" }}>
        {isConnected ? "Online" : "Offline"}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.dark.background,
      }}
    >
      <NetworkIndicator />
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
