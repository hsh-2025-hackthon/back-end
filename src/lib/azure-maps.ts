import MapsRoute, { toColonDelimitedLatLonString } from "@azure-rest/maps-route";
import { AzureKeyCredential } from "@azure/core-auth";

const mapsClientId = process.env.AZURE_MAPS_CLIENT_ID || "";
const mapsApiKey = process.env.AZURE_MAPS_API_KEY || "";

let client: ReturnType<typeof MapsRoute>;

export const getMapsRouteClient = () => {
    if (!client) {
        client = MapsRoute(new AzureKeyCredential(mapsApiKey));
    }
    return client;
};

export const calculateRoute = async (
    coordinates: number[][],
    travelMode: "car" | "truck" | "taxi" | "bus" | "van" | "motorcycle" | "bicycle" | "pedestrian" = "car"
) => {
    const routeClient = getMapsRouteClient();
    
    // Convert coordinates to the required format
    const routePoints = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(":");
    
    const result = await routeClient.path("/route/directions/{format}", "json").get({
        queryParameters: {
            query: routePoints,
            travelMode: travelMode,
        },
    });
    
    return result;
};
