import { MapsRouteClient, AzureKeyCredential } from "@azure/maps-route";

const mapsClientId = process.env.AZURE_MAPS_CLIENT_ID || "";
const mapsApiKey = process.env.AZURE_MAPS_API_KEY || "";

let client: MapsRouteClient;

export const getMapsRouteClient = () => {
    if (!client) {
        client = new MapsRouteClient(new AzureKeyCredential(mapsApiKey), {
            clientId: mapsClientId,
        });
    }
    return client;
};

export const calculateRoute = async (
    coordinates: number[][],
    travelMode: "car" | "truck" | "taxi" | "bus" | "van" | "motorcycle" | "bicycle" | "pedestrian" = "car"
) => {
    const routeClient = getMapsRouteClient();
    const result = await routeClient.route.getRouteDirections({
        routePoints: coordinates,
        travelMode: travelMode,
    });
    return result;
};
